import { analyzeConnectivity } from "../network/connectivity";
import type { Block } from "./blocks";

// Stitch the generated street grid to the real road graph into one canonical network, and check it
// joins as a single connected component (the stitching gate, ADR-R23). This is the one graph that
// both the connectivity gate and the reachability isochrone (src/reach) read, so a score can never
// describe a different city than the gate verified (the one-source-of-truth rule, G4). Upgraded from
// the G1 anchor model: the real side now carries its real nodes and real edge lengths, because an
// isochrone needs real topology and distances, not a collapsed anchor. Deterministic: nodes and edges
// are emitted in block, corner, and input order, never from a Set's iteration order.
//
// The rendered streets are NOT derived from this graph; they come from buildDistrictGraph (the grid
// only), so upgrading the stitch cannot move what G2 and G3 draw (asserted in the tests).

export type StitchNode = { id: string; enu: [number, number] };
export type StitchEdge = { from: string; to: string; lengthMetres: number };
export type StitchGraph = {
  nodes: StitchNode[];
  edges: StitchEdge[]; // undirected modeled as a directed edge each way
  adjacency: Map<string, number[]>; // node id -> outgoing edge indices
};

// The real road graph the generated grid stitches to. Edges are directed in the source but walk is
// symmetric, so the stitch adds each one both ways.
export type RealGraph = {
  nodes: StitchNode[];
  edges: { from: string; to: string; lengthMetres: number }[];
};

// The undirected topological graph of a gridded district: nodes are block corners (deduped by grid
// index), edges are block sides carrying their ENU length. This is the grid-only graph; the rendered
// streets read from it (uniqueStreets in expand), so it must not change when the real side changes.
export function buildDistrictGraph(blocks: Block[]): StitchGraph {
  const nodes: StitchNode[] = [];
  const nodeIndex = new Map<string, number>();
  const edges: StitchEdge[] = [];
  const edgeSeen = new Set<string>();

  const addNode = (i: number, j: number, enu: [number, number]): string => {
    const id = `g:${i}:${j}`;
    if (!nodeIndex.has(id)) {
      nodeIndex.set(id, nodes.length);
      nodes.push({ id, enu });
    }
    return id;
  };
  const addUndirected = (a: string, b: string): void => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    const ea = nodes[nodeIndex.get(a)!].enu;
    const eb = nodes[nodeIndex.get(b)!].enu;
    const len = Math.hypot(ea[0] - eb[0], ea[1] - eb[1]);
    edges.push({ from: a, to: b, lengthMetres: len });
    edges.push({ from: b, to: a, lengthMetres: len });
  };

  for (const blk of blocks) {
    const { i, j, ring } = blk;
    const c00 = addNode(i, j, ring[0]);
    const c10 = addNode(i + 1, j, ring[1]);
    const c11 = addNode(i + 1, j + 1, ring[2]);
    const c01 = addNode(i, j + 1, ring[3]);
    addUndirected(c00, c10);
    addUndirected(c10, c11);
    addUndirected(c11, c01);
    addUndirected(c01, c00);
  }

  return { nodes, edges, adjacency: buildAdjacency(nodes, edges) };
}

// Combine the district grid with the real graph: add the real nodes and real edges (both ways for
// walk), then connect each grid node to its nearest real node within snapRadius. Returns the combined
// graph and the connector count.
export function stitch(
  grid: StitchGraph,
  real: RealGraph,
  snapRadiusM: number
): { graph: StitchGraph; connectorCount: number } {
  const nodes: StitchNode[] = grid.nodes.concat(real.nodes);
  const edges: StitchEdge[] = grid.edges.slice();
  for (const e of real.edges) {
    edges.push({ from: e.from, to: e.to, lengthMetres: e.lengthMetres });
    edges.push({ from: e.to, to: e.from, lengthMetres: e.lengthMetres });
  }

  let connectorCount = 0;
  const r2 = snapRadiusM * snapRadiusM;
  for (const gn of grid.nodes) {
    let best = "";
    let bestD2 = Infinity;
    for (const rn of real.nodes) {
      const de = rn.enu[0] - gn.enu[0];
      const dn = rn.enu[1] - gn.enu[1];
      const d2 = de * de + dn * dn;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = rn.id;
      }
    }
    if (best && bestD2 <= r2) {
      const len = Math.sqrt(bestD2);
      edges.push({ from: gn.id, to: best, lengthMetres: len });
      edges.push({ from: best, to: gn.id, lengthMetres: len });
      connectorCount++;
    }
  }

  return { graph: { nodes, edges, adjacency: buildAdjacency(nodes, edges) }, connectorCount };
}

// The stitching gate: the combined graph must be a single connected component. Reuses the road
// network's Tarjan SCC (every edge is bidirectional here, so SCC equals connectivity).
export type StitchGate = {
  connected: boolean;
  components: number;
  strandedNodeIds: string[];
};

export function stitchGate(graph: StitchGraph): StitchGate {
  const r = analyzeConnectivity(graph);
  return {
    connected: r.components === 1,
    components: r.components,
    strandedNodeIds: r.strandedNodeIds,
  };
}

function buildAdjacency(nodes: StitchNode[], edges: StitchEdge[]): Map<string, number[]> {
  const adj = new Map<string, number[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (let i = 0; i < edges.length; i++) {
    const list = adj.get(edges[i].from);
    if (list) list.push(i);
    else adj.set(edges[i].from, [i]);
  }
  return adj;
}
