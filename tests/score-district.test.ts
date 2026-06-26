import { describe, it, expect } from "vitest";
import { GenerativeOpSchema } from "../src/generate/op";
import { expandDistrict } from "../src/generate/expand";
import { scoreDistrict, type ScoreContext } from "../src/score/scoreDistrict";
import { unitScore } from "../src/score/units";
import { reachScore } from "../src/score/reach";
import { heightfieldSpecForBounds } from "../src/study/heightfield";
import type { GeneratedDistrict, GenerativeContext } from "../src/generate/types";
import type { TrafficInputs } from "../src/score/traffic";
import type { AnalysisRegion, SunHoursSample } from "../src/study/studyTypes";

function buildExpanded() {
  const ops = [
    { op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 100, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true },
    { op: "FillBlocks", district: "d1", program: "residential", target: { population: 5000 }, heightEnvelope: { minStoreys: 6, maxStoreys: 6 }, coverage: 0.4 },
    { op: "PlaceOpenSpace", district: "d1", where: { kind: "rect", center: [0, 0], halfExtents: [50, 50], rotationRad: 0 }, areaM2: 5000, maxAspect: 2.5 },
  ].map((o) => GenerativeOpSchema.parse(o));
  const district: GeneratedDistrict = {
    id: "d1",
    seed: 1,
    region: { kind: "rect", center: [0, 0], halfExtents: [200, 200], rotationRad: 0 },
    ops,
    clearedClusterIds: [],
  };
  const ctx: GenerativeContext = { namedRegions: {}, streets: {}, districtBoundaries: {}, clusterCentroids: {} };
  return expandDistrict(district, ctx, { metresPerStorey: 3 });
}

const SPEC = heightfieldSpecForBounds([0, 0], 220, 5);
const SUN_REGION: AnalysisRegion = { id: "r", name: "r", kind: "rect", center: [0, 0], halfExtents: [50, 50], rotationRad: 0, source: "placed" };
const SAMPLES: SunHoursSample[] = [
  { minutesOfDay: 720, altitudeDeg: 40, azimuthDeg: 180, dir: [0.4, 0.6, 0.4], contributes: true, weightHours: 2 },
];
const TRAFFIC: TrafficInputs = {
  edges: [
    { id: "e1", from: "D", to: "G", lengthMetres: 500, lanes: 1, speedLimitKph: 50, roadClass: "residential", oneway: false, defaultedLanes: false },
    { id: "e2", from: "G", to: "D", lengthMetres: 500, lanes: 1, speedLimitKph: 50, roadClass: "residential", oneway: false, defaultedLanes: false },
  ],
  baseOD: [],
  gatewayNodeIds: ["G"],
  districtNodeId: "D",
};

describe("scoreDistrict (one source of truth)", () => {
  it("composes the four tools over the one ExpandedDistrict", () => {
    const d = buildExpanded();
    const ctx: ScoreContext = {
      sun: { region: SUN_REGION, occluders: [], spec: SPEC, samples: SAMPLES, resolution: 16 },
      reach: { withinMinutes: 5 },
      traffic: TRAFFIC,
    };
    const scores = scoreDistrict(d, ctx);

    // Units and reach are exactly the individual tools applied to the same district (no parallel
    // recomputation off a different graph or a re-derived massing).
    expect(scores.units).toEqual(unitScore(d));
    expect(scores.reach).toEqual(reachScore(d, 5));
    // Units trace to the expander's FillResult.
    expect(scores.units.achievedUnits).toBe(d.fillResults.reduce((s, f) => s + f.achievedUnits, 0));
    // The three geometry scores and the one demand-conditional score are distinguishable by basis.
    expect(scores.units.basis).toBe("geometry");
    expect(scores.sun.basis).toBe("geometry");
    expect(scores.reach.basis).toBe("geometry");
    expect(scores.traffic.basis).toBe("demand-conditional");
  });

  it("reaches some homes when the district has a park", () => {
    const d = buildExpanded();
    expect(d.openSpace.length).toBeGreaterThan(0);
    const reach = reachScore(d, 5);
    expect(reach.reachedFraction).toBeGreaterThan(0);
  });
});
