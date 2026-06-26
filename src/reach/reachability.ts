import { walkIsochrone } from "./isochrone";
import type { ExpandedDistrict } from "../generate/expand";
import type { StitchGraph } from "../generate/stitch";

// "A park reachable in N minutes" (ADR-R22): a multi-source walk isochrone from the park access nodes,
// with each home (residential lot) mapped to its nearest graph node. A lot whose nearest node has no
// path to a source returns unreachable, never a small plausible isochrone, which is the confidently
// wrong failure the gate refuses. Reads district.graph and district.lots, the one canonical object.
//
// APPROXIMATION, marked deliberately (no false precision): lot-to-nearest-node is an approximation of
// the walk origin. A lot whose nearest node sits across an unwalkable gap from its real frontage can be
// flattered or punished, so the reported fraction inherits that approximation. Fine at this resolution;
// not a gate. A later upgrade would snap each lot to its actual street frontage node.

export const DEFAULT_WALK_SPEED_MPS = 1.4;

export type ReachResult = {
  reachedFraction: number; // homes whose nearest node is within the threshold
  worstCaseMinutes: number; // longest walk among reachable homes
  unreachableCount: number; // homes with no path to any source
  withinMinutes: number;
  homeCount: number;
};

export function reachability(
  district: ExpandedDistrict,
  sourceNodeIds: string[],
  withinMinutes: number,
  walkSpeedMps: number = DEFAULT_WALK_SPEED_MPS
): ReachResult {
  const iso = walkIsochrone(district.graph, sourceNodeIds, walkSpeedMps);
  const homes = district.lots;
  let reached = 0;
  let unreachable = 0;
  let worst = 0;

  for (const lot of homes) {
    const nodeId = nearestNodeId(district.graph, lot.centroid);
    const m = nodeId !== null ? iso.minutes.get(nodeId) ?? Infinity : Infinity;
    if (!Number.isFinite(m)) {
      unreachable++;
      continue;
    }
    if (m <= withinMinutes) reached++;
    if (m > worst) worst = m;
  }

  return {
    reachedFraction: homes.length === 0 ? 0 : reached / homes.length,
    worstCaseMinutes: worst,
    unreachableCount: unreachable,
    withinMinutes,
    homeCount: homes.length,
  };
}

// The park access nodes for a district: the grid nodes on the corners of the reserved open-space
// blocks. Sorted for determinism.
export function parkAccessNodes(district: ExpandedDistrict): string[] {
  const ids = new Set<string>();
  for (const b of district.openSpace) {
    ids.add(`g:${b.i}:${b.j}`);
    ids.add(`g:${b.i + 1}:${b.j}`);
    ids.add(`g:${b.i + 1}:${b.j + 1}`);
    ids.add(`g:${b.i}:${b.j + 1}`);
  }
  return [...ids].sort();
}

function nearestNodeId(graph: StitchGraph, p: [number, number]): string | null {
  let best: string | null = null;
  let bestD2 = Infinity;
  for (const n of graph.nodes) {
    const de = n.enu[0] - p[0];
    const dn = n.enu[1] - p[1];
    const d2 = de * de + dn * dn;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = n.id;
    }
  }
  return best;
}
