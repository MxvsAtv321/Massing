import { describe, it, expect } from "vitest";
import { GenerativeOpSchema } from "../src/generate/op";
import { expandDistrict } from "../src/generate/expand";
import { unitScore } from "../src/score/units";
import { AVG_HOUSEHOLD_SIZE } from "../src/generate/fill";
import type { GeneratedDistrict, GenerativeContext } from "../src/generate/types";

function buildExpanded() {
  const ops = [
    { op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 100, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true },
    { op: "FillBlocks", district: "d1", program: "residential", target: { population: 5000 }, heightEnvelope: { minStoreys: 8, maxStoreys: 8 }, coverage: 0.45 },
  ].map((o) => GenerativeOpSchema.parse(o));
  const district: GeneratedDistrict = {
    id: "d1",
    seed: 1,
    region: { kind: "rect", center: [0, 0], halfExtents: [150, 150], rotationRad: 0 },
    ops,
    clearedClusterIds: [],
  };
  const ctx: GenerativeContext = { namedRegions: {}, streets: {}, districtBoundaries: {}, clusterCentroids: {} };
  return expandDistrict(district, ctx, { metresPerStorey: 3 });
}

describe("unitScore", () => {
  it("sums the expander's FillResult exactly, no recomputation", () => {
    const d = buildExpanded();
    const expected = d.fillResults.reduce((s, f) => s + f.achievedUnits, 0);
    const u = unitScore(d);
    expect(u.basis).toBe("geometry");
    expect(u.achievedUnits).toBe(expected);
    expect(u.achievedUnits).toBeGreaterThan(0);
    expect(u.population).toBe(Math.round(expected * AVG_HOUSEHOLD_SIZE));
  });
});
