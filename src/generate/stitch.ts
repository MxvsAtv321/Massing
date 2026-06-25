import { analyzeConnectivity } from "../network/connectivity";
import type { Block } from "./blocks";

// Stitch the generated street grid to the real road graph and check it joins as one connected
// component (the stitching gate, ADR-R23). Walk reachability and traffic both run over the stitched
// graph, so a district that looks connected but is a separate component yields a confidently wrong
// isochrone and flow with no visible symptom. The real boundary nodes are passed in as context (the
// expander never loads the network itself, ADR-R18), so this module stays pure and fixture-testable
// while the verify script exercises the real graph. Deterministic: nodes and edges are emitted in
// block and corner order, never from a Set's iteration order.

export type StitchNode = { id: string; enu: [number, number] };
export type StitchEdge = { from: string; to: string };
export type StitchGraph = {
  nodes: StitchNode[];
  edges: StitchEdge[]; // undirected modeled as a directed edge each way
  adjacency: Map<string, number[]>; // node id -> outgoing edge indices
};

// A real road-network node the generated grid must connect to.
export type RealBoundaryNode = { id: string; enu: [number, number] };

const REAL_ANCHOR = "real:anchor";

// The undirected topological graph of a gridded district: nodes are block corners (deduped by grid
// index), edges are block sides. Each undirected side is a directed edge each way, so Tarjan SCC
// connectivity equals undirected connectivity.
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
    edges.push({ from: a, to: b });
    edges.push({ from: b, to: a });
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

// Stitch the district graph to the real network. Every real boundary node joins a synthetic anchor
// (they are all mutually reachable on the real network, which this graph does not otherwise carry),
// and each connects to the nearest grid node within snapRadius. Returns the combined graph and the
// connector count.
export function stitch(
  grid: StitchGraph,
  realBoundary: RealBoundaryNode[],
  snapRadiusM: number
): { graph: StitchGraph; connectorCount: number } {
  const nodes: StitchNode[] = grid.nodes.slice();
  const edges: StitchEdge[] = grid.edges.slice();
  const addUndirected = (a: string, b: string): void => {
    edges.push({ from: a, to: b });
    edges.push({ from: b, to: a });
  };

  if (realBoundary.length > 0) nodes.push({ id: REAL_ANCHOR, enu: [0, 0] });

  let connectorCount = 0;
  const r2 = snapRadiusM * snapRadiusM;

  for (const rb of realBoundary) {
    nodes.push({ id: rb.id, enu: rb.enu });
    addUndirected(REAL_ANCHOR, rb.id); // the real network connects its own nodes
    let best = "";
    let bestD2 = Infinity;
    for (const gn of grid.nodes) {
      const de = gn.enu[0] - rb.enu[0];
      const dn = gn.enu[1] - rb.enu[1];
      const d2 = de * de + dn * dn;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = gn.id;
      }
    }
    if (best && bestD2 <= r2) {
      addUndirected(rb.id, best);
      connectorCount++;
    }
  }

  return { graph: { nodes, edges, adjacency: buildAdjacency(nodes, edges) }, connectorCount };
}

// The stitching gate: the combined graph must be a single connected component. Reuses the road
// network's Tarjan SCC analysis (every edge is bidirectional here, so SCC equals connectivity).
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
