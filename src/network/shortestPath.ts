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

// ---------------------------------------------------------------------------
// shortestPathTree: heap-based one-to-all Dijkstra with a dynamic per-edge cost. One run
// from a source serves all its destinations, which is what the flow assignment needs
// (the cost changes each increment as edges congest). Generic over any graph given as an
// edge list with `to` and a node->outgoing-edge-indices adjacency.
// ---------------------------------------------------------------------------

type HeapItem = { id: string; d: number };

// Lazy-deletion binary min-heap keyed by distance.
class MinHeap {
  private a: HeapItem[] = [];
  get size(): number {
    return this.a.length;
  }
  push(item: HeapItem): void {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].d <= a[i].d) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): HeapItem | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < n && a[l].d < a[s].d) s = l;
        if (r < n && a[r].d < a[s].d) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

export type ShortestPathTree = {
  dist: Map<string, number>;
  predEdge: Map<string, number>; // node id -> edge index used to reach it from the source
};

export function shortestPathTree(
  edges: { to: string }[],
  adjacency: Map<string, number[]>,
  sourceId: string,
  cost: (edgeIndex: number) => number
): ShortestPathTree {
  const dist = new Map<string, number>([[sourceId, 0]]);
  const predEdge = new Map<string, number>();
  const visited = new Set<string>();
  const heap = new MinHeap();
  heap.push({ id: sourceId, d: 0 });

  while (heap.size > 0) {
    const { id: u, d } = heap.pop()!;
    if (visited.has(u)) continue;
    visited.add(u);
    const out = adjacency.get(u);
    if (!out) continue;
    for (const ei of out) {
      const to = edges[ei].to;
      if (visited.has(to)) continue;
      const nd = d + cost(ei);
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        predEdge.set(to, ei);
        heap.push({ id: to, d: nd });
      }
    }
  }

  return { dist, predEdge };
}
