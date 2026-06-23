import { describe, it, expect } from "vitest";
import { buildAgentGraph, type AgentGraphData } from "../src/sim/agentGraph";
import { spawnAgents, stepAgents } from "../src/sim/agents";

// A closed triangle loop so every node has exactly one outgoing edge: handoff is
// then deterministic (no PRNG ambiguity) and agents never dead-end.
const LOOP: AgentGraphData = {
  nodes: [
    [0, 0],
    [10, 0],
    [0, 10],
  ],
  edges: [
    { from: 0, to: 1, pts: [[0, 0], [10, 0]], speedKph: 36, freeKph: 36 }, // len 10, 10 m/s
    { from: 1, to: 2, pts: [[10, 0], [0, 10]], speedKph: 36, freeKph: 36 },
    { from: 2, to: 0, pts: [[0, 10], [0, 0]], speedKph: 36, freeKph: 36 },
  ],
};

describe("spawnAgents", () => {
  it("is deterministic for a given seed", () => {
    const g = buildAgentGraph(LOOP);
    const a = spawnAgents(g, 200, 123);
    const b = spawnAgents(g, 200, 123);
    expect(Array.from(a.edge)).toEqual(Array.from(b.edge));
    expect(Array.from(a.dist)).toEqual(Array.from(b.dist));
  });

  it("places every agent on a valid edge within its length", () => {
    const g = buildAgentGraph(LOOP);
    const agents = spawnAgents(g, 500, 7);
    for (let i = 0; i < agents.count; i++) {
      const ei = agents.edge[i];
      expect(ei).toBeGreaterThanOrEqual(0);
      expect(ei).toBeLessThan(g.edges.length);
      expect(agents.dist[i]).toBeGreaterThanOrEqual(0);
      expect(agents.dist[i]).toBeLessThanOrEqual(g.edges[ei].length);
    }
  });
});

describe("stepAgents", () => {
  it("advances distance by speed * dt within an edge", () => {
    const g = buildAgentGraph(LOOP);
    const agents = { count: 1, edge: Int32Array.of(0), dist: Float32Array.of(0), seed: Uint32Array.of(1) };
    stepAgents(agents, g, 0.5); // 10 m/s * 0.5 = 5 m
    expect(agents.edge[0]).toBe(0);
    expect(agents.dist[0]).toBeCloseTo(5, 5);
  });

  it("hands off to the downstream edge and carries the remainder", () => {
    const g = buildAgentGraph(LOOP);
    const agents = { count: 1, edge: Int32Array.of(0), dist: Float32Array.of(8), seed: Uint32Array.of(1) };
    stepAgents(agents, g, 0.5); // 8 + 5 = 13 -> over edge 0 (len 10) -> edge 1 at 3
    expect(agents.edge[0]).toBe(1);
    expect(agents.dist[0]).toBeCloseTo(3, 5);
  });

  it("stays on the graph across many steps", () => {
    const g = buildAgentGraph(LOOP);
    const agents = spawnAgents(g, 100, 42);
    for (let s = 0; s < 200; s++) stepAgents(agents, g, 0.2);
    for (let i = 0; i < agents.count; i++) {
      expect(agents.edge[i]).toBeGreaterThanOrEqual(0);
      expect(agents.edge[i]).toBeLessThan(g.edges.length);
      expect(agents.dist[i]).toBeLessThanOrEqual(g.edges[agents.edge[i]].length + 1e-3);
    }
  });
});
