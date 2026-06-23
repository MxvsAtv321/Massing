import { describe, it, expect } from "vitest";
import {
  buildAgentGraph,
  sampleEdge,
  type AgentGraphData,
} from "../src/sim/agentGraph";

const DATA: AgentGraphData = {
  nodes: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
  edges: [
    { from: 0, to: 1, pts: [[0, 0], [10, 0]], speedKph: 36, freeKph: 36 },
    { from: 1, to: 2, pts: [[10, 0], [10, 10]], speedKph: 18, freeKph: 36 },
  ],
};

describe("buildAgentGraph", () => {
  it("computes cumulative length and total length per edge", () => {
    const g = buildAgentGraph(DATA);
    expect(g.edges[0].length).toBeCloseTo(10, 6);
    expect(g.edges[0].cumLen).toEqual([0, 10]);
  });

  it("converts kph to m/s for congested and free speeds", () => {
    const g = buildAgentGraph(DATA);
    expect(g.edges[0].speedMps).toBeCloseTo(10, 6); // 36 kph
    expect(g.edges[1].speedMps).toBeCloseTo(5, 6); // 18 kph
    expect(g.edges[1].freeMps).toBeCloseTo(10, 6); // 36 kph
  });

  it("builds outgoing adjacency per node", () => {
    const g = buildAgentGraph(DATA);
    expect(g.outgoing[0]).toEqual([0]);
    expect(g.outgoing[1]).toEqual([1]);
    expect(g.outgoing[2]).toEqual([]); // sink in this fixture
  });
});

describe("sampleEdge", () => {
  it("returns the endpoints at distance 0 and length", () => {
    const g = buildAgentGraph(DATA);
    const a = sampleEdge(g.edges[0], 0);
    expect([a.x, a.z]).toEqual([0, 0]);
    const b = sampleEdge(g.edges[0], 10);
    expect([b.x, b.z]).toEqual([10, 0]);
  });

  it("interpolates the midpoint and the unit travel direction", () => {
    const g = buildAgentGraph(DATA);
    const m = sampleEdge(g.edges[0], 5);
    expect(m.x).toBeCloseTo(5, 6);
    expect(m.z).toBeCloseTo(0, 6);
    expect(m.dirX).toBeCloseTo(1, 6);
    expect(m.dirZ).toBeCloseTo(0, 6);
  });

  it("clamps out-of-range distances to the edge", () => {
    const g = buildAgentGraph(DATA);
    expect(sampleEdge(g.edges[0], -5).x).toBe(0);
    expect(sampleEdge(g.edges[0], 999).x).toBe(10);
  });
});
