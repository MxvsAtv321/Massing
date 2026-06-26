import { describe, it, expect } from "vitest";
import { sunScore } from "../src/score/sun";
import { heightfieldSpecForBounds } from "../src/study/heightfield";
import type { ExpandedDistrict } from "../src/generate/expand";
import type { MassingPlacement } from "../src/generate/massing";
import type { AnalysisRegion, SunHoursSample } from "../src/study/studyTypes";

const SPEC = heightfieldSpecForBounds([0, 0], 50, 5);
const REGION: AnalysisRegion = {
  id: "r",
  name: "r",
  kind: "rect",
  center: [0, 0],
  halfExtents: [10, 10],
  rotationRad: 0,
  source: "placed",
};
// One low, angled sun sample worth 2 hours.
const SAMPLES: SunHoursSample[] = [
  { minutesOfDay: 720, altitudeDeg: 30, azimuthDeg: 180, dir: [0.5, 0.5, 0.5], contributes: true, weightHours: 2 },
];

function districtWith(massing: MassingPlacement[]): ExpandedDistrict {
  return {
    id: "t",
    seed: 1,
    streets: [],
    blocks: [],
    openSpace: [],
    lots: [],
    massing,
    graph: { nodes: [], edges: [], adjacency: new Map() },
    gate: { connected: true, components: 1, strandedNodeIds: [] },
    fillResults: [],
  };
}

const COVER: MassingPlacement = {
  id: "m",
  lotId: "l",
  template: "box",
  footprint: [[-50, -50], [50, -50], [50, 50], [-50, 50]],
  height: 200,
  storeys: 60,
};

describe("sunScore", () => {
  it("is geometry-derived, and a covering building removes the region's sun", () => {
    const open = sunScore(districtWith([]), REGION, [], SPEC, SAMPLES, 16);
    const shaded = sunScore(districtWith([COVER]), REGION, [], SPEC, SAMPLES, 16);
    expect(open.basis).toBe("geometry");
    expect(open.meanSunHours).toBeGreaterThan(shaded.meanSunHours);
    expect(shaded.meanSunHours).toBeLessThan(0.5);
  });
});
