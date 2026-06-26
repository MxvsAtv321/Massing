import { describe, it, expect } from "vitest";
import { reachability, parkAccessNodes } from "../src/reach/reachability";
import type { StitchGraph, StitchNode, StitchEdge } from "../src/generate/stitch";
import type { ExpandedDistrict } from "../src/generate/expand";

function makeGraph(nodes: StitchNode[], undirected: [string, string, number][]): StitchGraph {
  const edges: StitchEdge[] = [];
  for (const [a, b, len] of undirected) {
    edges.push({ from: a, to: b, lengthMetres: len });
    edges.push({ from: b, to: a, lengthMetres: len });
  }
  const adjacency = new Map<string, number[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  edges.forEach((e, i) => {
    const l = adjacency.get(e.from);
    if (l) l.push(i);
    else adjacency.set(e.from, [i]);
  });
  return { nodes, edges, adjacency };
}

// A grid line g:0:0 - g:1:0 - g:2:0, plus a disconnected fragment node the second home maps to.
const GRAPH = makeGraph(
  [
    { id: "g:0:0", enu: [0, 0] },
    { id: "g:1:0", enu: [100, 0] },
    { id: "g:2:0", enu: [200, 0] },
    { id: "g:9:9", enu: [1000, 1000] }, // fragment
  ],
  [["g:0:0", "g:1:0", 100], ["g:1:0", "g:2:0", 100]]
);

function district(): ExpandedDistrict {
  return {
    id: "t",
    seed: 1,
    streets: [],
    blocks: [],
    openSpace: [{ id: "b:0:0", i: 0, j: 0, ring: [[0, 0], [100, 0], [100, 100], [0, 100]] }],
    lots: [
      { id: "l1", blockId: "b", ring: [], centroid: [200, 0], areaM2: 100 }, // -> g:2:0, reachable
      { id: "l2", blockId: "b", ring: [], centroid: [1000, 1000], areaM2: 100 }, // -> fragment, unreachable
    ],
    massing: [],
    graph: GRAPH,
    gate: { connected: true, components: 1, strandedNodeIds: [] },
    fillResults: [],
  };
}

describe("parkAccessNodes", () => {
  it("returns the open-space block corner nodes, sorted", () => {
    expect(parkAccessNodes(district())).toEqual(["g:0:0", "g:0:1", "g:1:0", "g:1:1"]);
  });
});

describe("reachability", () => {
  it("reaches a connected home and reports an unstitched home as unreachable", () => {
    const r = reachability(district(), parkAccessNodes(district()), 10, 1.0);
    expect(r.homeCount).toBe(2);
    expect(r.unreachableCount).toBe(1); // the fragment home
    expect(r.reachedFraction).toBeCloseTo(0.5, 6); // one of two within 10 min
    expect(r.worstCaseMinutes).toBeCloseTo(100 / 60, 4); // g:2:0 is 100 m from the g:1:0 access node
  });

  it("reports no homes reached when there are no park sources", () => {
    const noPark = { ...district(), openSpace: [] };
    const r = reachability(noPark, parkAccessNodes(noPark), 10, 1.0);
    expect(r.reachedFraction).toBe(0);
    expect(r.unreachableCount).toBe(2);
  });
});
