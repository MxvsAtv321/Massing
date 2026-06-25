import { type EditOverlay } from "../mutation/applyEdit";
import type { GenerativeOp } from "./op";
import type { GeneratedDistrict, GenerativeContext } from "./types";
import { resolveRegion, pointInRing } from "./reference";

// Reduce generative ops (src/generate/op.ts) into the edit overlay (ADR-R19): a DefineDistrict
// claims a region, creating a district and clearing the real clusters inside it into the overlay's
// removedClusterIds (reversible, the baseline is never mutated, exactly the height-edit discipline
// of ADR-R11); shaping ops append to their district in order. Pure: every function returns a new
// overlay and never mutates its input. Op order is significant and preserved, and the cleared list
// is sorted, so the same op sequence yields the same overlay regardless of the centroid map's
// iteration order, which is the cheapest early proof of the G1 determinism gate (ADR-R23).

export class GenerativeOverlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerativeOverlayError";
  }
}

export function applyGenerativeOp(
  overlay: EditOverlay,
  op: GenerativeOp,
  ctx: GenerativeContext
): EditOverlay {
  if (op.op === "DefineDistrict") {
    if (overlay.generatedDistricts.some((d) => d.id === op.district)) {
      throw new GenerativeOverlayError(`district "${op.district}" is already defined`);
    }
    const region = resolveRegion(op.region, ctx);
    const cleared = clustersInRing(
      ctx.clusterCentroids,
      region.ring,
      overlay.removedClusterIds
    );
    const district: GeneratedDistrict = {
      id: op.district,
      seed: op.seed,
      region: op.region,
      ops: [],
      clearedClusterIds: cleared,
    };
    const removed = new Set(overlay.removedClusterIds);
    for (const id of cleared) removed.add(id);
    return {
      ...overlay,
      removedClusterIds: removed,
      generatedDistricts: [...overlay.generatedDistricts, district],
    };
  }

  // Shaping ops target an existing district.
  const idx = overlay.generatedDistricts.findIndex((d) => d.id === op.district);
  if (idx < 0) {
    throw new GenerativeOverlayError(
      `op "${op.op}" targets unknown district "${op.district}"`
    );
  }
  const generatedDistricts = overlay.generatedDistricts.map((d, i) =>
    i === idx ? { ...d, ops: [...d.ops, op] } : d
  );
  return { ...overlay, generatedDistricts };
}

export function applyGenerativeOps(
  overlay: EditOverlay,
  ops: GenerativeOp[],
  ctx: GenerativeContext
): EditOverlay {
  return ops.reduce((o, op) => applyGenerativeOp(o, op, ctx), overlay);
}

// Drop a district and un-clear exactly the clusters it newly cleared, so removing a proposal
// restores the real city it stood on. Clusters removed by a user edit are untouched, because the
// district only recorded the ones it newly removed.
export function removeDistrict(overlay: EditOverlay, districtId: string): EditOverlay {
  const district = overlay.generatedDistricts.find((d) => d.id === districtId);
  if (!district) return overlay;
  const removed = new Set(overlay.removedClusterIds);
  for (const id of district.clearedClusterIds) removed.delete(id);
  return {
    ...overlay,
    removedClusterIds: removed,
    generatedDistricts: overlay.generatedDistricts.filter((d) => d.id !== districtId),
  };
}

// Cluster ids whose centroid falls inside the region ring and that are not already removed, sorted
// for determinism (independent of the centroid map's iteration order).
function clustersInRing(
  centroids: Record<string, [number, number]>,
  ring: [number, number][],
  alreadyRemoved: ReadonlySet<string>
): string[] {
  const hit: string[] = [];
  for (const id of Object.keys(centroids)) {
    if (alreadyRemoved.has(id)) continue;
    const [e, n] = centroids[id];
    if (pointInRing(ring, e, n)) hit.push(id);
  }
  hit.sort();
  return hit;
}
