import type { BuildingForScene } from "../mutation/building";
import type { ClusterIndexEntry } from "../model/types";

// Lookups that connect a rendered BatchedMesh instance back to its building
// cluster, so a raycast hit (batchId) resolves to a selectable identity, and so
// a height edit knows what to scale against. All pure and THREE-free, unit-tested
// in node; the renderer feeds them the geometry order it actually built (see
// cityGeometry.buildBuildingGeometries), never a re-derived order.

// clusterId -> representative (tallest-member) height in metres. This is the
// denominator for a height edit's scale ratio (newHeight / representativeHeight).
export function buildClusterRepHeights(
  clusters: Record<string, ClusterIndexEntry>
): Map<string, number> {
  const m = new Map<string, number>();
  for (const id in clusters) {
    m.set(id, clusters[id].representativeHeight_m);
  }
  return m;
}

// buildingId -> clusterId, for turning the geometry-order building ids that
// cityGeometry emits into per-instance cluster ids.
export function buildBuildingClusterMap(
  buildings: BuildingForScene[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of buildings) m.set(b.id, b.clusterId);
  return m;
}

// Per-instance clusterId, indexed by BatchedMesh instanceId. Built from the
// ordered building ids returned alongside the geometries, so it stays aligned
// with the instances by construction regardless of how cityGeometry filters.
export function buildInstanceClusterIds(
  orderedBuildingIds: string[],
  idToCluster: Map<string, string>
): string[] {
  return orderedBuildingIds.map((id) => idToCluster.get(id) ?? "");
}

// A raycast against the BatchedMesh yields a batchId (the instanceId). Resolve it
// to a clusterId, or null when there is no hit or no mapping.
export function resolveClusterFromBatchId(
  batchId: number | undefined,
  instanceClusterIds: string[]
): string | null {
  if (
    batchId === undefined ||
    batchId < 0 ||
    batchId >= instanceClusterIds.length
  ) {
    return null;
  }
  return instanceClusterIds[batchId] || null;
}
