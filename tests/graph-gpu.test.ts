import { describe, it, expect } from "vitest";
import { buildAgentGraph, type AgentGraphData } from "../src/sim/agentGraph";
import { buildGpuGraph } from "../src/sim/graphGpu";

// Triangle loop: node 0->1->2->0, plus a branch 0->2 so node 0 has two outgoing.
const DATA: AgentGraphData = {
  nodes: [
    [0, 0],
    [30, 0],
    [0, 40],
  ],
  edges: [
    { from: 0, to: 1, pts: [[0, 0], [30, 0]], speedKph: 36, freeKph: 36 }, // len 30
    { from: 1, to: 2, pts: [[30, 0], [0, 40]], speedKph: 18, freeKph: 36 },
    { from: 2, to: 0, pts: [[0, 40], [0, 0]], speedKph: 36, freeKph: 36 }, // len 40
    { from: 0, to: 2, pts: [[0, 0], [0, 40]], speedKph: 36, freeKph: 36 }, // len 40
  ],
};

describe("buildGpuGraph", () => {
  const g = buildGpuGraph(buildAgentGraph(DATA));

  it("flattens edge endpoints and straight lengths", () => {
    expect(Array.from(g.edgeP0.slice(0, 2))).toEqual([0, 0]);
    expect(Array.from(g.edgeP1.slice(0, 2))).toEqual([30, 0]);
    expect(g.edgeLen[0]).toBeCloseTo(30, 6);
    expect(g.edgeLen[2]).toBeCloseTo(40, 6);
  });

  it("converts speeds to m/s", () => {
    expect(g.edgeSpeed[0]).toBeCloseTo(10, 6); // 36 kph
    expect(g.edgeSpeed[1]).toBeCloseTo(5, 6); // 18 kph
    expect(g.edgeFree[1]).toBeCloseTo(10, 6);
  });

  it("records the destination node of each edge", () => {
    expect(Array.from(g.edgeTo)).toEqual([1, 2, 0, 2]);
  });

  it("builds CSR adjacency: offsets are a running count, edges grouped by from-node", () => {
    // node 0 has edges [0, 3], node 1 has [1], node 2 has [2]
    expect(Array.from(g.csrOffset)).toEqual([0, 2, 3, 4]);
    expect(g.csrEdges.length).toBe(g.edgeCount);
    const node0 = Array.from(g.csrEdges.slice(g.csrOffset[0], g.csrOffset[1]));
    expect(node0.sort()).toEqual([0, 3]);
    expect(Array.from(g.csrEdges.slice(g.csrOffset[1], g.csrOffset[2]))).toEqual([1]);
    expect(Array.from(g.csrEdges.slice(g.csrOffset[2], g.csrOffset[3]))).toEqual([2]);
  });
});
