import { shortestPathTree } from "../network/shortestPath";
import type { StitchGraph } from "../generate/stitch";

// A multi-source walk isochrone over the combined stitched graph (src/generate/stitch), the one
// canonical network the connectivity gate also reads (G4). One Dijkstra tree from a zero-cost
// super-source into every source node gives the walk-minutes from the nearest source to every node.
// Built on the existing heap Dijkstra (shortestPathTree); cost is edge length over walk speed. A node
// with no path returns Infinity (absent from the tree), never a small plausible number, which is the
// degenerate case the reachability gate hammers.

const SUPER_SOURCE = "__iso_source__";

export type Isochrone = {
  minutes: Map<string, number>; // node id -> walk minutes from the nearest source; absent means unreached
};

export function walkIsochrone(
  graph: StitchGraph,
  sourceNodeIds: string[],
  walkSpeedMps: number
): Isochrone {
  // Augment the edge list and adjacency with a zero-cost super-source into each source node.
  const edges = graph.edges.slice();
  const adjacency = new Map(graph.adjacency);
  const superAdj: number[] = [];
  for (const sid of sourceNodeIds) {
    superAdj.push(edges.length);
    edges.push({ from: SUPER_SOURCE, to: sid, lengthMetres: 0 });
  }
  adjacency.set(SUPER_SOURCE, superAdj);

  const cost = (ei: number): number => edges[ei].lengthMetres / walkSpeedMps / 60; // minutes
  const { dist } = shortestPathTree(edges, adjacency, SUPER_SOURCE, cost);
  dist.delete(SUPER_SOURCE);
  return { minutes: dist };
}
