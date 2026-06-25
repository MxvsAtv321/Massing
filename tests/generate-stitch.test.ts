import { describe, it, expect } from "vitest";
import { buildGrid } from "../src/generate/grid";
import { partitionBlocks } from "../src/generate/blocks";
import {
  buildDistrictGraph,
  stitch,
  stitchGate,
  type RealBoundaryNode,
} from "../src/generate/stitch";
import type { ResolvedRegion } from "../src/generate/reference";

const RECT: ResolvedRegion = {
  ring: [[-100, -100], [100, -100], [100, 100], [-100, 100]],
  center: [0, 0],
};

function districtGraph() {
  const grid = buildGrid(RECT, 0, 100); // 2x2 cells, 3x3 nodes
  return buildDistrictGraph(partitionBlocks(grid, RECT));
}

// A real network node just east of the grid edge (nearest grid node g:2:1 sits at [100, 0]).
const NEAR: RealBoundaryNode = { id: "r1", enu: [110, 0] };
const FAR: RealBoundaryNode = { id: "r2", enu: [400, 400] };

// ─── buildDistrictGraph ─────────────────────────────────────────────────────────

describe("buildDistrictGraph", () => {
  it("dedupes block corners into a 3x3 node lattice", () => {
    const g = districtGraph();
    expect(g.nodes).toHaveLength(9);
    expect(g.adjacency.size).toBe(9);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it("is deterministic (stable node and edge order)", () => {
    const a = districtGraph();
    const b = districtGraph();
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.edges).toEqual(b.edges);
  });
});

// ─── the stitching gate (ADR-R23) ───────────────────────────────────────────────

describe("stitch + stitchGate", () => {
  it("joins the grid to the real network as one component within the snap radius", () => {
    const { graph, connectorCount } = stitch(districtGraph(), [NEAR], 20);
    expect(connectorCount).toBe(1);
    const gate = stitchGate(graph);
    expect(gate.connected).toBe(true);
    expect(gate.components).toBe(1);
  });

  it("fails the gate when no boundary node is within the snap radius", () => {
    const { graph, connectorCount } = stitch(districtGraph(), [NEAR], 5);
    expect(connectorCount).toBe(0);
    const gate = stitchGate(graph);
    expect(gate.connected).toBe(false);
    expect(gate.components).toBeGreaterThan(1);
  });

  it("strands a far boundary node that no connector reaches", () => {
    const { graph } = stitch(districtGraph(), [FAR], 20);
    expect(stitchGate(graph).connected).toBe(false);
  });

  it("connects through any one reachable boundary node", () => {
    // FAR cannot reach the grid, but NEAR can, so the whole graph is one component.
    const { graph, connectorCount } = stitch(districtGraph(), [NEAR, FAR], 20);
    expect(connectorCount).toBe(1);
    expect(stitchGate(graph).connected).toBe(true);
  });
});
