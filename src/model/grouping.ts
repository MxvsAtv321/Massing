// polygon-clipping's ESM build exports a default object; named exports are in the CJS build only.
// Use the default import so both webpack (Next.js) and tsx/vitest CJS paths work.
import polygonClipping from "polygon-clipping";
import type { Building, ClusterIndexEntry } from "./types";

// AABB-plus-epsilon is a fast-reject filter only. Two polygons whose bounding boxes
// overlap within epsilon are candidates for a full intersection test, but if they do
// not actually intersect they are NOT merged. Near-but-non-overlapping polygons from
// distinct neighboring buildings therefore remain in separate clusters. This is
// acceptable for v1: same-building podium/shaft pairs overlap by construction.
const NEAR_EPSILON_M = 0.5;

type Aabb = { minX: number; minY: number; maxX: number; maxY: number };

function computeAabb(rings: number[][][]): Aabb {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const ring of rings) {
    for (const pt of ring) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }
  return { minX, minY, maxX, maxY };
}

function aabbsOverlap(a: Aabb, b: Aabb, epsilon: number): boolean {
  return (
    a.minX - epsilon <= b.maxX &&
    a.maxX + epsilon >= b.minX &&
    a.minY - epsilon <= b.maxY &&
    a.maxY + epsilon >= b.minY
  );
}

function polygonsIntersect(a: number[][][], b: number[][][]): boolean {
  // polygon-clipping works on arbitrary 2D coordinates; ENU metres are fine here.
  const result = polygonClipping.intersection(
    a as [number, number][][],
    b as [number, number][][]
  );
  return result.length > 0;
}

// Union-Find with path compression.
function makeUnionFind(n: number): { find: (i: number) => number; union: (i: number, j: number) => void } {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number): void {
    parent[find(i)] = find(j);
  }
  return { find, union };
}

export type ClusterResult = {
  buildings: Building[];
  clusters: Record<string, ClusterIndexEntry>;
};

export function buildClusters(buildings: Building[]): ClusterResult {
  const n = buildings.length;
  const aabbs = buildings.map((b) => computeAabb(b.footprint));
  const uf = makeUnionFind(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!aabbsOverlap(aabbs[i], aabbs[j], NEAR_EPSILON_M)) continue;
      if (polygonsIntersect(buildings[i].footprint, buildings[j].footprint)) {
        uf.union(i, j);
      }
    }
  }

  // Group indices by root.
  const rootToIndices = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const group = rootToIndices.get(root) ?? [];
    group.push(i);
    rootToIndices.set(root, group);
  }

  const clusters: Record<string, ClusterIndexEntry> = {};
  const updatedBuildings: Building[] = [...buildings];

  let clusterSeq = 0;
  for (const indices of rootToIndices.values()) {
    const clusterId = `c${clusterSeq++}`;
    let tallestIdx = indices[0];
    for (const idx of indices) {
      if (buildings[idx].height.value > buildings[tallestIdx].height.value) {
        tallestIdx = idx;
      }
    }
    const representativeHeight_m = buildings[tallestIdx].height.value;
    const memberIds = indices.map((i) => buildings[i].id);
    const tallestMemberId = buildings[tallestIdx].id;

    clusters[clusterId] = {
      clusterId,
      representativeHeight_m,
      memberIds,
      tallestMemberId,
    };

    for (const idx of indices) {
      updatedBuildings[idx] = {
        ...buildings[idx],
        clusterId,
        isTallestInCluster: idx === tallestIdx,
      };
    }
  }

  return { buildings: updatedBuildings, clusters };
}
