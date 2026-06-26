import { describe, it, expect } from "vitest";
import { GenerativeOpSchema } from "../src/generate/op";
import { Sandbox, withinTolerance, closerToTarget } from "../src/agent/sandbox";
import type { GenerativeContext } from "../src/generate/types";

const CTX: GenerativeContext = { namedRegions: {}, streets: {}, districtBoundaries: {}, clusterCentroids: {} };
const OPTS = { metresPerStorey: 3 };

const op = (raw: unknown) => GenerativeOpSchema.parse(raw);
const DEFINE = op({ op: "DefineDistrict", district: "d1", region: { kind: "rect", center: [0, 0], halfExtents: [150, 150], rotationRad: 0 }, seed: 1 });
const LAY = op({ op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 100, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true });
const FILL = op({ op: "FillBlocks", district: "d1", program: "residential", target: { unitsPerHa: 600 }, heightEnvelope: { minStoreys: 8, maxStoreys: 8 }, coverage: 0.45 });

describe("Sandbox", () => {
  it("applies ops, expands, and reports building count and population", () => {
    const sb = new Sandbox(CTX, OPTS);
    expect(sb.applyOp(DEFINE).ok).toBe(true);
    expect(sb.applyOp(LAY).ok).toBe(true);
    const r = sb.applyOp(FILL);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.buildingCount).toBeGreaterThan(0);
    expect(sb.totalPopulation()).toBeGreaterThan(0);
  });

  it("scores units with basis geometry from the same district", () => {
    const sb = new Sandbox(CTX, OPTS);
    sb.applyOp(DEFINE);
    sb.applyOp(LAY);
    sb.applyOp(FILL);
    const s = sb.score("units", "d1");
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.score.basis).toBe("geometry");
  });

  it("rejects a shaping op before its district is defined", () => {
    const sb = new Sandbox(CTX, OPTS);
    expect(sb.applyOp(FILL).ok).toBe(false);
  });

  it("produces a stable signature for the same op sequence", () => {
    const a = new Sandbox(CTX, OPTS);
    [DEFINE, LAY, FILL].forEach((o) => a.applyOp(o));
    const b = new Sandbox(CTX, OPTS);
    [DEFINE, LAY, FILL].forEach((o) => b.applyOp(o));
    expect(a.signatureAll()).toBe(b.signatureAll());
    expect(a.signatureAll().length).toBeGreaterThan(0);
  });

  it("errors cleanly when a score needs context that is absent", () => {
    const sb = new Sandbox(CTX, OPTS);
    [DEFINE, LAY, FILL].forEach((o) => sb.applyOp(o));
    expect(sb.score("sun", "d1").ok).toBe(false);
  });
});

describe("convergence helpers", () => {
  it("withinTolerance", () => {
    expect(withinTolerance(9950, 10000, 0.01)).toBe(true);
    expect(withinTolerance(9800, 10000, 0.01)).toBe(false);
  });
  it("closerToTarget", () => {
    expect(closerToTarget(9900, 9000, 10000)).toBe(true);
    expect(closerToTarget(9000, 9900, 10000)).toBe(false);
  });
});
