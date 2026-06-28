import type { RoadNetwork, NetworkNode } from "../network/types";
import type { Place, CordonSide } from "./demand";

// Cordon auto-derivation (I5). The curated Toronto cordon hand-picks arterial crossings of the catchment
// boundary; a city we ingested has none. So derive the gateways from the road graph itself: the boundary
// is the network's ENU extent, and a gateway is a node near a perimeter edge, where a drivable road
// reaches the boundary. Each node is assigned to its nearest edge (N/E/S/W) and gateways are spread along
// each edge so the through-traffic scenario has entries on opposite sides. This is what lets the demand
// structural gate run on any city with no hand-placed coordinates. Pure, THREE-free, unit-tested.

export type DeriveCordonOpts = {
  marginM?: number; // a node within this of a perimeter edge is a boundary crossing
  maxPerSide?: number; // cap gateways per side, spread evenly along the edge
};

type Cand = { node: NetworkNode; along: number };

export function deriveCordon(network: RoadNetwork, opts: DeriveCordonOpts = {}): Place[] {
  const margin = opts.marginM ?? 40;
  const maxPerSide = opts.maxPerSide ?? 6;
  const nodes = network.nodes;
  if (nodes.length === 0) return [];

  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const n of nodes) {
    const [e, north] = n.enu;
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (north < minN) minN = north;
    if (north > maxN) maxN = north;
  }

  // Assign each node to its nearest perimeter edge; keep it if within the margin of that edge.
  const bySide: Record<CordonSide, Cand[]> = { N: [], E: [], S: [], W: [] };
  for (const n of nodes) {
    const [e, north] = n.enu;
    const dW = e - minE;
    const dE = maxE - e;
    const dS = north - minN;
    const dN = maxN - north;
    const m = Math.min(dW, dE, dS, dN);
    if (m > margin) continue;
    if (m === dW) bySide.W.push({ node: n, along: north });
    else if (m === dE) bySide.E.push({ node: n, along: north });
    else if (m === dS) bySide.S.push({ node: n, along: e });
    else bySide.N.push({ node: n, along: e });
  }

  // Fallback so every side has at least one gateway (the through-scenario needs opposite sides): if a
  // side caught nothing within the margin, take the single node closest to that edge.
  const extremeFor = (side: CordonSide): Cand => {
    let best = nodes[0];
    let bestDist = Infinity;
    for (const n of nodes) {
      const [e, north] = n.enu;
      const d = side === "W" ? e - minE : side === "E" ? maxE - e : side === "S" ? north - minN : maxN - north;
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return { node: best, along: side === "W" || side === "E" ? best.enu[1] : best.enu[0] };
  };

  const places: Place[] = [];
  const used = new Set<string>();
  for (const side of ["N", "E", "S", "W"] as CordonSide[]) {
    let cands = bySide[side].slice().sort((a, b) => a.along - b.along);
    if (cands.length === 0) cands = [extremeFor(side)];
    const picked = pickSpread(cands, maxPerSide);
    let i = 0;
    for (const c of picked) {
      if (used.has(c.node.id)) continue; // distinct connector nodes
      used.add(c.node.id);
      places.push({
        id: `gw-${side}-${i}`,
        label: `${side} boundary ${i}`,
        side,
        centroidEnu: c.node.enu,
        connectorNodeId: c.node.id,
      });
      i++;
    }
  }
  return places;
}

// Evenly sample up to k items from a sorted list, including both ends, so gateways spread along an edge.
function pickSpread<T>(arr: T[], k: number): T[] {
  if (k <= 1) return arr.length > 0 ? [arr[Math.floor(arr.length / 2)]] : [];
  if (arr.length <= k) return arr;
  const out: T[] = [];
  for (let i = 0; i < k; i++) {
    out.push(arr[Math.round((i * (arr.length - 1)) / (k - 1))]);
  }
  return out;
}
