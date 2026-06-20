import { describe, it, expect } from "vitest";
import { dijkstra, shortestPathTree } from "../src/network/shortestPath";
import type { RoadNetwork, NetworkNode, NetworkEdge } from "../src/network/types";

// Build a directed weighted RoadNetwork from [from, to, lengthMetres] triples.
function net(dir: [string, string, number][]): RoadNetwork {
  const ids = new Set<string>();
  for (const [a, b] of dir) {
    ids.add(a);
    ids.add(b);
  }
  const nodes: NetworkNode[] = [...ids].map((id) => ({ id, osmNodeId: Number(id), enu: [0, 0], degree: 0 }));
  const edges: NetworkEdge[] = dir.map(([from, to, len], i) => ({
    id: `e${i}`,
    from,
    to,
    geometry: [],
    lengthMetres: len,
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
  return {
    originLatLon: [0, 0],
    crsNote: "",
    nodes,
    edges,
    adjacency,
    provenance: {
      source: "t", license: "t", attribution: "t", api: "t", query: "t", retrievedDate: "t",
      bbox: { south: 0, west: 0, north: 0, east: 0 },
      drivableFilter: { include: [], exclude: [], note: "" },
    },
    coverage: {
      rawNodes: 0, rawWays: 0, undirectedSegments: 0, excludedZeroLength: 0, excludedDanglingWays: 0,
      graphNodesBeforePrune: nodes.length, directedEdgesBeforePrune: edges.length, strandedNodes: 0,
      strandedComponents: 0, graphNodes: nodes.length, directedEdges: edges.length, centerlineKm: 0, connected: true,
    },
  };
}

describe("shortestPathTree", () => {
  const g = net([
    ["1", "2", 10],
    ["1", "3", 5],
    ["3", "4", 3],
    ["2", "4", 10],
    ["4", "5", 7],
  ]);

  it("matches single-pair dijkstra distances from one source to every target", () => {
    const tree = shortestPathTree(g.edges, g.adjacency, "1", (ei) => g.edges[ei].lengthMetres);
    for (const target of ["2", "3", "4", "5"]) {
      const single = dijkstra(g, "1", target);
      expect(single).not.toBeNull();
      expect(tree.dist.get(target)).toBeCloseTo(single!.distance, 9);
    }
    // 1 -> 3 -> 4 -> 5 = 5 + 3 + 7 = 15
    expect(tree.dist.get("5")).toBeCloseTo(15, 9);
  });

  it("respects a dynamic cost function (not just static length)", () => {
    // Make edge 1->3 hugely expensive; shortest to 4 should switch to 1->2->4 = 20.
    const cost = (ei: number) => (g.edges[ei].from === "1" && g.edges[ei].to === "3" ? 1000 : g.edges[ei].lengthMetres);
    const tree = shortestPathTree(g.edges, g.adjacency, "1", cost);
    expect(tree.dist.get("4")).toBeCloseTo(20, 9);
  });

  it("leaves unreachable nodes out of the dist map", () => {
    const h = net([["1", "2", 4]]);
    const tree = shortestPathTree(h.edges, h.adjacency, "2", (ei) => h.edges[ei].lengthMetres);
    expect(tree.dist.has("1")).toBe(false);
  });
});
