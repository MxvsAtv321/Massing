import { describe, it, expect } from "vitest";
import { analyzeConnectivity } from "../src/network/connectivity";
import type { RoadNetwork, NetworkNode, NetworkEdge } from "../src/network/types";

// Build a minimal directed graph view from node ids and directed edges.
function graph(
  nodeIds: string[],
  dir: [string, string][]
): Pick<RoadNetwork, "nodes" | "edges" | "adjacency"> {
  const nodes: NetworkNode[] = nodeIds.map((id) => ({
    id,
    osmNodeId: Number(id),
    enu: [0, 0],
    degree: 0,
  }));
  const edges: NetworkEdge[] = dir.map(([from, to], i) => ({
    id: `e${i}`,
    from,
    to,
    geometry: [],
    lengthMetres: 1,
    lanes: 1,
    speedLimitKph: 40,
    roadClass: "residential",
    oneway: true,
    osmWayId: i,
    provenance: {
      source: "t",
      date: "t",
      confidence: { kind: "estimated", sigma_m: 1 },
      defaulted: { lanes: false, speed: false },
    },
  }));
  const adjacency = new Map<string, number[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  edges.forEach((e, i) => adjacency.get(e.from)!.push(i));
  return { nodes, edges, adjacency };
}

describe("analyzeConnectivity", () => {
  it("reports a single component for a directed cycle", () => {
    const g = graph(["1", "2", "3"], [["1", "2"], ["2", "3"], ["3", "1"]]);
    const r = analyzeConnectivity(g);
    expect(r.components).toBe(1);
    expect(r.largestComponentNodes).toBe(3);
    expect(r.strandedNodeIds).toEqual([]);
  });

  it("strands a node reachable but unable to return", () => {
    const g = graph(
      ["1", "2", "3", "4"],
      [["1", "2"], ["2", "3"], ["3", "1"], ["3", "4"]]
    );
    const r = analyzeConnectivity(g);
    expect(r.components).toBe(2);
    expect(r.largestComponentNodes).toBe(3);
    expect(r.strandedNodeIds).toEqual(["4"]);
  });

  it("keeps the larger of two disjoint cycles as the main component", () => {
    const g = graph(
      ["1", "2", "3", "4", "5"],
      [["1", "2"], ["2", "1"], ["3", "4"], ["4", "5"], ["5", "3"]]
    );
    const r = analyzeConnectivity(g);
    expect(r.components).toBe(2);
    expect(r.largestComponentNodes).toBe(3);
    expect([...r.strandedNodeIds].sort()).toEqual(["1", "2"]);
  });

  it("handles an empty graph", () => {
    const r = analyzeConnectivity(graph([], []));
    expect(r).toEqual({ components: 0, largestComponentNodes: 0, strandedNodeIds: [] });
  });
});
