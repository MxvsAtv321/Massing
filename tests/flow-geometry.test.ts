import { describe, it, expect } from "vitest";
import { congestionColor, fadeColor, groupSegments } from "../src/scene/flowGeometry";
import type { RoutableEdge } from "../src/traffic/routableGraph";
import type { FlowResult, EdgeFlow } from "../src/traffic/assignment";

describe("congestionColor", () => {
  it("is green at free flow and deep red when oversaturated", () => {
    const free = congestionColor(0);
    const jammed = congestionColor(2.0); // clamps to the last stop
    expect(free[1]).toBeGreaterThan(free[0]); // green channel dominant
    expect(jammed[0]).toBeGreaterThan(jammed[1]); // red channel dominant
  });

  it("gets redder (more red, less green) as v/c rises", () => {
    const a = congestionColor(0.2);
    const b = congestionColor(1.0);
    expect(b[0]).toBeGreaterThan(a[0]);
    expect(b[1]).toBeLessThan(a[1]);
  });
});

describe("fadeColor", () => {
  it("returns the color unchanged at zero band width", () => {
    const c = congestionColor(0.5);
    expect(fadeColor(c, 0)).toEqual(c);
  });

  it("washes toward grey as the band widens", () => {
    const c = congestionColor(0); // saturated green, far from 0.5 grey
    const faded = fadeColor(c, 0.5);
    // green channel (0.62) moves down toward 0.5; red channel (0.27) moves up toward 0.5
    expect(faded[1]).toBeLessThan(c[1]);
    expect(faded[0]).toBeGreaterThan(c[0]);
  });
});

describe("groupSegments", () => {
  function edge(id: string, from: string, to: string): RoutableEdge {
    return {
      id,
      from,
      to,
      geometry: [[0, 0], [10, 0]],
      lengthMetres: 10,
      lanes: 2,
      speedLimitKph: 40,
      roadClass: "primary",
      oneway: false,
      defaultedLanes: false,
    };
  }
  function ef(edgeId: string, vcMid: number, bandWidthRel: number): EdgeFlow {
    return {
      edgeId,
      volumeMid: 0,
      volumeLow: 0,
      volumeHigh: 0,
      vcMid,
      vcLow: 0,
      vcHigh: 0,
      speedMidKph: 0,
      speedLowKph: 0,
      speedHighKph: 0,
      bandWidthRel,
    };
  }

  it("collapses the two directions of a street to the worse v/c and wider band", () => {
    const edges = [edge("99:1->2", "1", "2"), edge("99:2->1", "2", "1")];
    const flow = {
      perEdge: new Map<string, EdgeFlow>([
        ["99:1->2", ef("99:1->2", 0.4, 0.1)],
        ["99:2->1", ef("99:2->1", 1.1, 0.3)],
      ]),
    } as unknown as FlowResult;

    const segs = groupSegments(edges, flow);
    expect(segs).toHaveLength(1);
    expect(segs[0].vc).toBeCloseTo(1.1, 6);
    expect(segs[0].bandWidthRel).toBeCloseTo(0.3, 6);
  });
});
