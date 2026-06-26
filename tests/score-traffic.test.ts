import { describe, it, expect } from "vitest";
import { trafficScore, type TrafficInputs } from "../src/score/traffic";
import type { ExpandedDistrict } from "../src/generate/expand";

const INPUTS: TrafficInputs = {
  edges: [
    { id: "e1", from: "D", to: "G", lengthMetres: 500, lanes: 1, speedLimitKph: 50, roadClass: "residential", oneway: false, defaultedLanes: false },
    { id: "e2", from: "G", to: "D", lengthMetres: 500, lanes: 1, speedLimitKph: 50, roadClass: "residential", oneway: false, defaultedLanes: false },
  ],
  baseOD: [],
  gatewayNodeIds: ["G"],
  districtNodeId: "D",
};

const D = {} as ExpandedDistrict; // trafficScore does not read the geometry; demand comes from population

describe("trafficScore", () => {
  it("is marked demand-conditional with an explicit note", () => {
    const t = trafficScore(D, 500, INPUTS);
    expect(t.basis).toBe("demand-conditional");
    expect(t.assumedDemandNote).toContain("not a prediction");
  });

  it("congestion does not fall as population rises", () => {
    const low = trafficScore(D, 100, INPUTS).maxVC;
    const high = trafficScore(D, 5000, INPUTS).maxVC;
    expect(high).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThan(0);
  });
});
