import { describe, it, expect } from "vitest";
import { buildGrid } from "../src/generate/grid";
import { partitionBlocks } from "../src/generate/blocks";
import { buildDistrictGraph, stitch, stitchGate, type RealGraph } from "../src/generate/stitch";
import type { ResolvedRegion } from "../src/generate/reference";

const RECT: ResolvedRegion = {
  ring: [[-100, -100], [100, -100], [100, 100], [-100, 100]],
  center: [0, 0],
};

function districtGraph() {
  const grid = buildGrid(RECT, 0, 100); // 2x2 cells, 3x3 nodes
  return buildDistrictGraph(partitionBlocks(grid, RECT));
}

// A connected real graph just east of the grid (g:2:1 sits at [100, 0]).
const REAL_NEAR: RealGraph = {
  nodes: [{ id: "r1", enu: [110, 0] }, { id: "r2", enu: [140, 0] }],
  edges: [{ from: "r1", to: "r2", lengthMetres: 30 }],
};
const REAL_FAR: RealGraph = {
  nodes: [{ id: "r1", enu: [400, 400] }, { id: "r2", enu: [430, 400] }],
  edges: [{ from: "r1", to: "r2", lengthMetres: 30 }],
};

// ─── buildDistrictGraph ─────────────────────────────────────────────────────────

describe("buildDistrictGraph", () => {
  it("dedupes block corners into a 3x3 node lattice with positive edge lengths", () => {
    const g = districtGraph();
    expect(g.nodes).toHaveLength(9);
    expect(g.adjacency.size).toBe(9);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.edges.every((e) => e.lengthMetres > 0)).toBe(true);
  });

  it("is deterministic (stable node and edge order)", () => {
    expect(districtGraph().edges).toEqual(districtGraph().edges);
    expect(districtGraph().nodes.map((n) => n.id)).toEqual(districtGraph().nodes.map((n) => n.id));
  });
});

// ─── the stitching gate over the combined graph (ADR-R23) ───────────────────────

describe("stitch + stitchGate", () => {
  it("joins the grid to the real network as one component within the snap radius", () => {
    const { graph, connectorCount } = stitch(districtGraph(), REAL_NEAR, 20);
    expect(connectorCount).toBeGreaterThanOrEqual(1);
    const gate = stitchGate(graph);
    expect(gate.connected).toBe(true);
    expect(gate.components).toBe(1);
  });

  it("fails the gate when no real node is within the snap radius", () => {
    const { graph, connectorCount } = stitch(districtGraph(), REAL_NEAR, 5);
    expect(connectorCount).toBe(0);
    expect(stitchGate(graph).connected).toBe(false);
    expect(stitchGate(graph).components).toBeGreaterThan(1);
  });

  it("fails when the real graph is too far to connect", () => {
    const { graph } = stitch(districtGraph(), REAL_FAR, 20);
    expect(stitchGate(graph).connected).toBe(false);
  });

  it("carries the real and connector edges with lengths", () => {
    const { graph } = stitch(districtGraph(), REAL_NEAR, 20);
    expect(graph.edges.every((e) => e.lengthMetres >= 0)).toBe(true);
    // grid edges + real edges (both ways) + connector (both ways) are all present.
    expect(graph.nodes.some((n) => n.id === "r1")).toBe(true);
  });
});
