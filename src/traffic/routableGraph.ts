import type { RoadNetwork, RoadClass } from "../network/types";

// A slim, serializable view of the network for flow assignment and the flow overlay.
// Carries only what the engine and the colored ribbons need; the adjacency is rebuilt on
// whichever side holds the edges (the client receives nodes + edges and calls
// buildAdjacency, since a Map does not serialize across the server boundary).
export type RoutableEdge = {
  id: string;
  from: string;
  to: string;
  geometry: [number, number][]; // ENU, for the flow overlay
  lengthMetres: number;
  lanes: number;
  speedLimitKph: number;
  roadClass: RoadClass;
  oneway: boolean;
  defaultedLanes: boolean; // Part 1 honesty flag: lanes were class-defaulted, capacity is less certain
};

export type RoutableNode = { id: string; enu: [number, number] };

export type RoutableGraph = {
  nodes: RoutableNode[];
  edges: RoutableEdge[];
  adjacency: Map<string, number[]>; // node id -> outgoing edge indices
};

export function buildAdjacency(
  nodes: RoutableNode[],
  edges: RoutableEdge[]
): Map<string, number[]> {
  const adj = new Map<string, number[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (let i = 0; i < edges.length; i++) {
    const list = adj.get(edges[i].from);
    if (list) list.push(i);
    else adj.set(edges[i].from, [i]);
  }
  return adj;
}

export function toRoutableNodes(network: RoadNetwork): RoutableNode[] {
  return network.nodes.map((n) => ({ id: n.id, enu: n.enu }));
}

export function toRoutableEdges(network: RoadNetwork): RoutableEdge[] {
  return network.edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    geometry: e.geometry,
    lengthMetres: e.lengthMetres,
    lanes: e.lanes,
    speedLimitKph: e.speedLimitKph,
    roadClass: e.roadClass,
    oneway: e.oneway,
    defaultedLanes: e.provenance.defaulted.lanes,
  }));
}

export function toRoutableGraph(network: RoadNetwork): RoutableGraph {
  const nodes = toRoutableNodes(network);
  const edges = toRoutableEdges(network);
  return { nodes, edges, adjacency: buildAdjacency(nodes, edges) };
}
