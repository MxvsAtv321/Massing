import { describe, it, expect } from "vitest";
import { validateFlow, type CountMatch, type CountStation } from "../src/traffic/validation";
import type { FlowResult, EdgeFlow } from "../src/traffic/assignment";

function station(id: string, measuredVol: number): CountStation {
  return { id, name: id, enu: [0, 0], measuredVol, avgSpeedKph: null, countDate: "" };
}

function ef(edgeId: string, volumeMid: number): EdgeFlow {
  return {
    edgeId,
    volumeMid,
    volumeLow: volumeMid,
    volumeHigh: volumeMid,
    vcMid: 0,
    vcLow: 0,
    vcHigh: 0,
    speedMidKph: 0,
    speedLowKph: 0,
    speedHighKph: 0,
    bandWidthRel: 0,
  };
}

describe("validateFlow", () => {
  // Station 1: measured 800, simulated 400+400 = 800 -> GEH 0.
  // Station 2: measured 100, simulated 200 -> GEH sqrt(2*100^2/300) ~ 8.16.
  const flow = {
    perEdge: new Map<string, EdgeFlow>([
      ["e1", ef("e1", 400)],
      ["e2", ef("e2", 400)],
      ["e3", ef("e3", 200)],
    ]),
  } as unknown as FlowResult;

  const matches: CountMatch[] = [
    { station: station("s1", 800), segmentKey: "k1", edgeIds: ["e1", "e2"], distMetres: 3 },
    { station: station("s2", 100), segmentKey: "k2", edgeIds: ["e3"], distMetres: 4 },
  ];

  const v = validateFlow(matches, flow, 5);

  it("sums both directions for the cross-section and scores GEH per station", () => {
    const s1 = v.perStation.find((s) => s.id === "s1")!;
    const s2 = v.perStation.find((s) => s.id === "s2")!;
    expect(s1.simulated).toBe(800);
    expect(s1.geh).toBe(0);
    expect(s2.simulated).toBe(200);
    expect(s2.geh).toBeCloseTo(8.165, 3);
  });

  it("aggregates matched count, median GEH, and percentages", () => {
    expect(v.nMatched).toBe(2);
    expect(v.nStations).toBe(5);
    expect(v.medianGeh).toBeCloseTo((0 + 8.165) / 2, 3);
    expect(v.pctUnder5).toBeCloseTo(50, 6); // only s1
    expect(v.pctUnder10).toBeCloseTo(100, 6); // both
  });
});
