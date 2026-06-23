import type { AgentGraph } from "./agentGraph";

// Structure-of-arrays agent state (ADR-R06): one typed array per field, not an
// array of objects, so the same layout maps straight onto GPU storage buffers in
// 5c. Each agent rides a current edge at a distance along it; the per-agent seed
// drives a deterministic turn choice at intersections. Pure and THREE-free.
export type Agents = {
  count: number;
  edge: Int32Array; // current edge index
  dist: Float32Array; // distance along the current edge, metres
  seed: Uint32Array; // per-agent PRNG state for the turn choice
};

// mulberry32-style stateless step + value, so a given seed always picks the same
// turns (deterministic, testable, and trivial to port to the GPU kernel).
function hashStep(s: number): number {
  return (s + 0x6d2b79f5) >>> 0;
}
function randFromState(s: number): number {
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Spawn agents spread across the graph, weighted by edge length so density is
// even per kilometre. Deterministic given the seed.
export function spawnAgents(graph: AgentGraph, count: number, seed: number): Agents {
  const edge = new Int32Array(count);
  const dist = new Float32Array(count);
  const seeds = new Uint32Array(count);

  const cum: number[] = [];
  let total = 0;
  for (const e of graph.edges) {
    total += e.length;
    cum.push(total);
  }

  let s = seed >>> 0;
  for (let a = 0; a < count; a++) {
    s = hashStep(s);
    const target = randFromState(s) * total;
    // Binary search the cumulative-length table for the chosen edge.
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const ei = total > 0 ? lo : 0;
    edge[a] = ei;
    s = hashStep(s);
    dist[a] = randFromState(s) * graph.edges[ei].length;
    s = hashStep(s);
    seeds[a] = s;
  }

  return { count, edge, dist, seed: seeds };
}

// Advance every agent by speed * dt along its edge, handing off to a downstream
// edge (chosen by the per-agent PRNG) at each intersection and carrying the
// remainder. Guarded against tiny edges / huge dt so it cannot spin.
export function stepAgents(agents: Agents, graph: AgentGraph, dt: number): void {
  const { edge, dist, seed } = agents;
  const edges = graph.edges;
  const outgoing = graph.outgoing;

  for (let a = 0; a < agents.count; a++) {
    let ei = edge[a];
    let d = dist[a] + edges[ei].speedMps * dt;

    let guard = 0;
    while (d >= edges[ei].length && guard++ < 8) {
      d -= edges[ei].length;
      const out = outgoing[edges[ei].to];
      seed[a] = hashStep(seed[a]);
      const r = randFromState(seed[a]);
      if (out && out.length > 0) {
        ei = out[Math.floor(r * out.length) % out.length];
      } else {
        // Dead end (should not happen on a strongly connected graph): respawn.
        ei = Math.floor(r * edges.length) % edges.length;
        d = 0;
      }
    }

    edge[a] = ei;
    dist[a] = d;
  }
}
