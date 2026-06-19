import type { RoadNetwork } from "./types";

export type ShortestPathResult = {
  distance: number; // metres
  path: string[]; // node ids, source to target inclusive
};

// Dijkstra over edge lengthMetres. A linear-scan frontier is fine for the gate's
// handful of queries on a few-hundred-node graph; the flow sim in Part 3 can swap in a
// heap without changing the adjacency representation. No product routing uses this yet;
// it exists to support the known-route gate (and the later flow work).
export function dijkstra(
  network: RoadNetwork,
  fromId: string,
  toId: string
): ShortestPathResult | null {
  const { edges, adjacency } = network;
  if (!adjacency.has(fromId) || !adjacency.has(toId)) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  dist.set(fromId, 0);

  const frontier = new Set<string>([fromId]);

  while (frontier.size > 0) {
    let u: string | null = null;
    let best = Infinity;
    for (const id of frontier) {
      const d = dist.get(id)!;
      if (d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null) break;
    frontier.delete(u);
    if (u === toId) break;
    if (visited.has(u)) continue;
    visited.add(u);

    for (const ei of adjacency.get(u)!) {
      const e = edges[ei];
      if (visited.has(e.to)) continue;
      const nd = best + e.lengthMetres;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
        frontier.add(e.to);
      }
    }
  }

  const d = dist.get(toId);
  if (d === undefined || !Number.isFinite(d)) return null;

  const path: string[] = [];
  let cur: string | undefined = toId;
  while (cur !== undefined) {
    path.push(cur);
    if (cur === fromId) break;
    cur = prev.get(cur);
  }
  path.reverse();
  if (path[0] !== fromId) return null;

  return { distance: d, path };
}
