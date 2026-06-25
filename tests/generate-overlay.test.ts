import { describe, it, expect } from "vitest";
import { emptyOverlay, type EditOverlay } from "../src/mutation/applyEdit";
import {
  applyGenerativeOp,
  applyGenerativeOps,
  removeDistrict,
  GenerativeOverlayError,
} from "../src/generate/overlay";
import { GenerativeOpSchema, type GenerativeOp } from "../src/generate/op";
import type { GenerativeContext } from "../src/generate/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// A 100x100 region centered at the origin. cIn1 and cIn2 sit inside it; cOut is far away.
const CTX: GenerativeContext = {
  namedRegions: {},
  streets: {},
  districtBoundaries: {},
  clusterCentroids: {
    cIn1: [10, 10],
    cIn2: [-10, -10],
    cOut: [500, 500],
  },
};

const REGION = {
  kind: "rect" as const,
  center: [0, 0] as [number, number],
  halfExtents: [50, 50] as [number, number],
  rotationRad: 0,
};

const op = (raw: unknown): GenerativeOp => GenerativeOpSchema.parse(raw);

const DEFINE = op({ op: "DefineDistrict", district: "d1", region: REGION, seed: 7 });
const LAY = op({
  op: "LayStreets",
  district: "d1",
  pattern: "grid",
  blockSizeM: 80,
  primaryAxis: { kind: "bearing", deg: 0 },
  carFree: true,
});
const FILL = op({
  op: "FillBlocks",
  district: "d1",
  program: "residential",
  target: { population: 40000 },
  heightEnvelope: { minStoreys: 4, maxStoreys: 20 },
  coverage: 0.4,
});

// ─── emptyOverlay carries the new channel ───────────────────────────────────────

describe("emptyOverlay", () => {
  it("has an empty generatedDistricts list", () => {
    expect(emptyOverlay().generatedDistricts).toEqual([]);
  });
});

// ─── DefineDistrict: create and clear ───────────────────────────────────────────

describe("applyGenerativeOp — DefineDistrict", () => {
  it("creates the district and clears the real clusters inside the region (sorted)", () => {
    const o = applyGenerativeOp(emptyOverlay(), DEFINE, CTX);
    expect(o.generatedDistricts).toHaveLength(1);
    const d = o.generatedDistricts[0];
    expect(d.id).toBe("d1");
    expect(d.seed).toBe(7);
    expect(d.ops).toEqual([]);
    expect(d.clearedClusterIds).toEqual(["cIn1", "cIn2"]); // sorted, cOut excluded
    expect([...o.removedClusterIds].sort()).toEqual(["cIn1", "cIn2"]);
  });

  it("does not mutate the input overlay (baseline immutability)", () => {
    const before = emptyOverlay();
    applyGenerativeOp(before, DEFINE, CTX);
    expect(before.generatedDistricts).toHaveLength(0);
    expect(before.removedClusterIds.size).toBe(0);
  });

  it("only newly-clears clusters not already removed", () => {
    const seeded: EditOverlay = { ...emptyOverlay(), removedClusterIds: new Set(["cIn1"]) };
    const o = applyGenerativeOp(seeded, DEFINE, CTX);
    expect(o.generatedDistricts[0].clearedClusterIds).toEqual(["cIn2"]);
    expect([...o.removedClusterIds].sort()).toEqual(["cIn1", "cIn2"]);
  });

  it("throws when the district id is already defined", () => {
    const o = applyGenerativeOp(emptyOverlay(), DEFINE, CTX);
    expect(() => applyGenerativeOp(o, DEFINE, CTX)).toThrow(GenerativeOverlayError);
  });
});

// ─── Shaping ops append in order ────────────────────────────────────────────────

describe("applyGenerativeOp — shaping ops", () => {
  it("appends a shaping op to its district in order", () => {
    let o = applyGenerativeOp(emptyOverlay(), DEFINE, CTX);
    o = applyGenerativeOp(o, LAY, CTX);
    o = applyGenerativeOp(o, FILL, CTX);
    const d = o.generatedDistricts[0];
    expect(d.ops.map((x) => x.op)).toEqual(["LayStreets", "FillBlocks"]);
  });

  it("throws when a shaping op targets an unknown district", () => {
    expect(() => applyGenerativeOp(emptyOverlay(), LAY, CTX)).toThrow(GenerativeOverlayError);
  });
});

// ─── removeDistrict reverses the clear ──────────────────────────────────────────

describe("removeDistrict", () => {
  it("drops the district and un-clears exactly the clusters it cleared", () => {
    const o = applyGenerativeOps(emptyOverlay(), [DEFINE, LAY], CTX);
    const back = removeDistrict(o, "d1");
    expect(back.generatedDistricts).toHaveLength(0);
    expect(back.removedClusterIds.size).toBe(0);
  });

  it("leaves a user-removed cluster removed after the district is dropped", () => {
    const seeded: EditOverlay = { ...emptyOverlay(), removedClusterIds: new Set(["cIn1"]) };
    const o = applyGenerativeOp(seeded, DEFINE, CTX);
    const back = removeDistrict(o, "d1");
    expect([...back.removedClusterIds]).toEqual(["cIn1"]); // cIn2 un-cleared, cIn1 kept
  });

  it("is a no-op for an unknown district id", () => {
    const o = applyGenerativeOp(emptyOverlay(), DEFINE, CTX);
    expect(removeDistrict(o, "zz")).toBe(o);
  });
});

// ─── Determinism: the apply-twice proof (cheapest early proof of ADR-R23) ───────

describe("determinism", () => {
  const ops = [DEFINE, LAY, FILL];

  it("produces an identical overlay for the same op sequence applied twice", () => {
    const a = applyGenerativeOps(emptyOverlay(), ops, CTX);
    const b = applyGenerativeOps(emptyOverlay(), ops, CTX);
    expect(a.generatedDistricts).toEqual(b.generatedDistricts);
    expect([...a.removedClusterIds].sort()).toEqual([...b.removedClusterIds].sort());
  });

  it("clears the same sorted set regardless of centroid map insertion order", () => {
    const reordered: GenerativeContext = {
      ...CTX,
      clusterCentroids: { cOut: [500, 500], cIn2: [-10, -10], cIn1: [10, 10] },
    };
    const a = applyGenerativeOp(emptyOverlay(), DEFINE, CTX);
    const b = applyGenerativeOp(emptyOverlay(), DEFINE, reordered);
    expect(a.generatedDistricts[0].clearedClusterIds).toEqual(
      b.generatedDistricts[0].clearedClusterIds
    );
    expect(a.generatedDistricts[0].clearedClusterIds).toEqual(["cIn1", "cIn2"]);
  });
});
