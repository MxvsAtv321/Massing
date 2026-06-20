import { describe, it, expect } from "vitest";
import { assignOnce, DEFAULT_ASSIGN_PARAMS, type ODNodeFlow } from "../src/traffic/assignment";
import { buildAdjacency, type RoutableEdge, type RoutableGraph } from "../src/traffic/routableGraph";
import type { RoadClass } from "../src/network/types";

function edge(
  id: string,
  from: string,
  to: string,
  length: number,
  speed: number,
  lanes: number,
  roadClass: RoadClass
): RoutableEdge {
  return {
    id,
    from,
    to,
    geometry: [[0, 0], [1, 0]],
    lengthMetres: length,
    speedLimitKph: speed,
    lanes,
    roadClass,
    oneway: true,
    defaultedLanes: false,
  };
}

// Two routes from O to D:
//   short, low-capacity:  O -A-> D  (residential, ~200 s free-flow, 1000 veh/hr)
//   long, high-capacity:  O -B-> D  (primary, ~300 s free-flow, 4000 veh/hr)
function twoRouteGraph(): RoutableGraph {
  const nodes = ["O", "A", "B", "D"].map((id) => ({ id, enu: [0, 0] as [number, number] }));
  const edges = [
    edge("OA", "O", "A", 1000, 36, 2, "residential"),
    edge("AD", "A", "D", 1000, 36, 2, "residential"),
    edge("OB", "O", "B", 1500, 36, 4, "primary"),
    edge("BD", "B", "D", 1500, 36, 4, "primary"),
  ];
  return { nodes, edges, adjacency: buildAdjacency(nodes, edges) };
}

function volById(g: RoutableGraph, vol: number[]): Map<string, number> {
  const m = new Map<string, number>();
  g.edges.forEach((e, i) => m.set(e.id, vol[i]));
  return m;
}

describe("assignOnce", () => {
  const g = twoRouteGraph();

  it("sends all of a light demand on the shorter route", () => {
    const od: ODNodeFlow[] = [{ fromNodeId: "O", toNodeId: "D", tripsPerHour: 200 }];
    const v = volById(g, assignOnce(g, od, DEFAULT_ASSIGN_PARAMS).volume);
    expect(v.get("OA")).toBeCloseTo(200, 6);
    expect(v.get("OB")).toBe(0);
  });

  it("diverts some heavy demand onto the alternate route as the short one congests", () => {
    const od: ODNodeFlow[] = [{ fromNodeId: "O", toNodeId: "D", tripsPerHour: 3000 }];
    const v = volById(g, assignOnce(g, od, DEFAULT_ASSIGN_PARAMS).volume);
    expect(v.get("OB")!).toBeGreaterThan(0); // alternate route used
    expect(v.get("OA")!).toBeGreaterThan(0); // short route still used
    // Trips conserved: everything leaving O equals the demand.
    expect(v.get("OA")! + v.get("OB")!).toBeCloseTo(3000, 4);
  });

  it("reports an OD pair with no path as unroutable", () => {
    const od: ODNodeFlow[] = [{ fromNodeId: "O", toNodeId: "Z", tripsPerHour: 100 }];
    const res = assignOnce(g, od, DEFAULT_ASSIGN_PARAMS);
    expect(res.unroutable).toHaveLength(1);
    expect(res.unroutable[0].toNodeId).toBe("Z");
  });
});
