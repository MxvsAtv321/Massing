import { describe, it, expect } from "vitest";
import { emptyOverlay } from "../src/mutation/applyEdit";
import { applyGenerativeOps } from "../src/generate/overlay";
import { GenerativeOpSchema, type GenerativeOp } from "../src/generate/op";
import { expandDistrict, geometrySignature, type ExpandOpts } from "../src/generate/expand";
import { distanceToAnchor } from "../src/generate/gradient";
import { massLot } from "../src/generate/massing";
import { computeFill, requestedUnits, ringArea } from "../src/generate/fill";
import type { GenerativeContext } from "../src/generate/types";

// ─── Fixture district and context ───────────────────────────────────────────────

const WATER: [number, number][] = [[-200, -200], [200, -200]]; // the south edge runs east

const CTX: GenerativeContext = {
  namedRegions: {},
  streets: {},
  districtBoundaries: {},
  clusterCentroids: {},
  waterEdge: WATER,
  realBoundaryNodes: [{ id: "r1", enu: [210, 0] }],
};

const OPTS: ExpandOpts = { metresPerStorey: 3, snapRadiusM: 60 };

const RAW_OPS = [
  { op: "DefineDistrict", district: "d1", region: { kind: "rect", center: [0, 0], halfExtents: [200, 200], rotationRad: 0 }, seed: 123 },
  { op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 100, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true },
  { op: "FillBlocks", district: "d1", program: "residential", target: { population: 5000 }, heightEnvelope: { minStoreys: 4, maxStoreys: 24 }, coverage: 0.4 },
  { op: "ApplyGradient", district: "d1", field: "height", anchor: "waterEdge", falloffM: 400, falloffShape: "smooth", direction: "down" },
];

function district(ops = RAW_OPS) {
  const parsed: GenerativeOp[] = ops.map((o) => GenerativeOpSchema.parse(o));
  const overlay = applyGenerativeOps(emptyOverlay(), parsed, CTX);
  return overlay.generatedDistricts[0];
}

// ─── Structure ──────────────────────────────────────────────────────────────────

describe("expandDistrict", () => {
  it("produces streets, blocks, lots, massing, a fill result, and a passing gate", () => {
    const d = expandDistrict(district(), CTX, OPTS);
    expect(d.streets.length).toBeGreaterThan(0);
    expect(d.blocks.length).toBe(16); // 4x4 cells over a 400x400 region at 100 m blocks
    expect(d.lots.length).toBeGreaterThan(0);
    expect(d.massing).toHaveLength(d.lots.length);
    expect(d.fillResults).toHaveLength(1);
    expect(d.gate.connected).toBe(true);
  });
});

// ─── Determinism (the headless half of the ADR-R23 gate) ────────────────────────

describe("expandDistrict determinism", () => {
  it("produces identical geometry for the same ops and seed", () => {
    const a = expandDistrict(district(), CTX, OPTS);
    const b = expandDistrict(district(), CTX, OPTS);
    expect(a.massing).toEqual(b.massing);
    expect(geometrySignature(a)).toBe(geometrySignature(b));
  });

  it("is independent of context collection order", () => {
    const reordered: GenerativeContext = {
      ...CTX,
      realBoundaryNodes: [{ id: "rX", enu: [9999, 9999] }, { id: "r1", enu: [210, 0] }],
    };
    const a = expandDistrict(district(), CTX, OPTS);
    const b = expandDistrict(district(), reordered, OPTS);
    expect(geometrySignature(a)).toBe(geometrySignature(b));
  });
});

// ─── Carry: gradient monotonic along the anchor axis ────────────────────────────

describe("height gradient", () => {
  it("steps storeys non-decreasing with distance from the water anchor", () => {
    const d = expandDistrict(district(), CTX, OPTS);
    const centroidOf = new Map(d.lots.map((l) => [l.id, l.centroid]));
    const ranked = d.massing
      .map((m) => {
        const c = centroidOf.get(m.lotId)!;
        return { storeys: m.storeys, dist: distanceToAnchor({ kind: "polyline", points: WATER }, c[0], c[1]) };
      })
      .sort((a, b) => a.dist - b.dist);

    let prev = -1;
    for (const r of ranked) {
      expect(r.storeys).toBeGreaterThanOrEqual(prev);
      prev = r.storeys;
    }
    // The gradient actually varies the heights (not a flat field).
    expect(ranked[ranked.length - 1].storeys).toBeGreaterThan(ranked[0].storeys);
  });
});

// ─── Carry: shortfall computed on post-gradient heights ─────────────────────────

describe("fill result under a gradient", () => {
  it("counts achieved units from the post-gradient massing, below the envelope max", () => {
    const d = expandDistrict(district(), CTX, OPTS);
    const achieved = d.fillResults[0].achievedUnits;

    // The reported achieved matches a fresh count over the actual built massing.
    const requested = requestedUnits({ population: 5000 }, ringArea([[-200, -200], [200, -200], [200, 200], [-200, 200]]));
    expect(achieved).toBe(computeFill(d.massing, "residential", requested).achievedUnits);

    // It is strictly below what the same lots at the envelope max would yield, proving the count is
    // post-gradient, not the pre-gradient envelope ceiling.
    const atMax = d.lots.map((l) => massLot(l, 24, 0.4, 3));
    const achievedMax = computeFill(atMax, "residential", requested).achievedUnits;
    expect(achieved).toBeGreaterThan(0);
    expect(achieved).toBeLessThan(achievedMax);
  });
});

// ─── Street-aware mask: do not build on real roads ──────────────────────────────

describe("street-aware mask", () => {
  it("drops lots within the road buffer and still builds off the road", () => {
    const road: [number, number][] = [[-200, 0], [200, 0]]; // straight through the region center
    const ctx: GenerativeContext = { ...CTX, roadCenterlines: [road] };
    const d = expandDistrict(district(), ctx, { ...OPTS, roadBufferM: 15 });
    const centroidOf = new Map(d.lots.map((l) => [l.id, l.centroid]));
    for (const m of d.massing) {
      const c = centroidOf.get(m.lotId)!;
      expect(Math.abs(c[1])).toBeGreaterThanOrEqual(15 - 1e-6); // clear of the n=0 road line
    }
    expect(d.massing.length).toBeGreaterThan(0);
  });
});
