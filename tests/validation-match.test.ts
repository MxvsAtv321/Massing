import { describe, it, expect } from "vitest";
import { matchCountsToEdges, pointToPolylineDist, type CountStation } from "../src/traffic/validation";
import type { RoutableEdge } from "../src/traffic/routableGraph";

function edge(id: string, from: string, to: string, geometry: [number, number][]): RoutableEdge {
  return {
    id,
    from,
    to,
    geometry,
    lengthMetres: 100,
    lanes: 2,
    speedLimitKph: 40,
    roadClass: "primary",
    oneway: false,
    defaultedLanes: false,
  };
}

function station(id: string, enu: [number, number], measuredVol = 500): CountStation {
  return { id, name: id, enu, measuredVol, avgSpeedKph: null, countDate: "" };
}

// One two-way street A-B: two directed edges sharing a segment.
const EDGES: RoutableEdge[] = [
  edge("9:A->B", "A", "B", [[0, 0], [100, 0]]),
  edge("9:B->A", "B", "A", [[100, 0], [0, 0]]),
];

describe("pointToPolylineDist", () => {
  it("measures perpendicular distance to a segment", () => {
    expect(pointToPolylineDist([50, 5], [[0, 0], [100, 0]])).toBeCloseTo(5, 9);
  });
  it("clamps to the nearest endpoint past the ends", () => {
    expect(pointToPolylineDist([-10, 0], [[0, 0], [100, 0]])).toBeCloseTo(10, 9);
  });
});

describe("matchCountsToEdges", () => {
  it("matches a nearby station and includes both directions as the cross-section", () => {
    const { matches, unmatched } = matchCountsToEdges([station("s1", [50, 5])], EDGES, 30);
    expect(unmatched).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(matches[0].distMetres).toBeCloseTo(5, 6);
    expect([...matches[0].edgeIds].sort()).toEqual(["9:A->B", "9:B->A"]);
  });

  it("leaves a far station unmatched", () => {
    const { matches, unmatched } = matchCountsToEdges([station("far", [50, 100])], EDGES, 30);
    expect(matches).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });
});
