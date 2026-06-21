import type { BuildingForScene } from "./building";
import type { AddBuildingOp, EditOp } from "./editOp";
import { storeyToMetres } from "./editOp";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HypotheticalBuilding = BuildingForScene & {
  origin: "user-edit";
  confidence: { kind: "hypothetical" };
};

export type EditOverlay = {
  removedClusterIds: Set<string>;
  modifiedClusterHeights: Map<string, number>; // clusterId -> new repHeight (metres)
  addedBuildings: HypotheticalBuilding[];
};

// ─── Overlay helpers ──────────────────────────────────────────────────────────

export function emptyOverlay(): EditOverlay {
  return {
    removedClusterIds: new Set(),
    modifiedClusterHeights: new Map(),
    addedBuildings: [],
  };
}

// 20×20 m square footprint centred at `at`, with a closing vertex.
function squareFootprint(at: [number, number]): number[][][] {
  const [e, n] = at;
  return [
    [
      [e - 10, n - 10],
      [e + 10, n - 10],
      [e + 10, n + 10],
      [e - 10, n + 10],
      [e - 10, n - 10],
    ],
  ];
}

// Applies a single EditOp to an existing overlay and returns the new overlay.
// addIndex is incremented by the caller for each AddBuilding to ensure stable,
// deterministic IDs that survive log replay.
export function applyOpToOverlay(
  overlay: EditOverlay,
  op: EditOp,
  clusterRepHeights: Map<string, number>,
  metresPerStorey: number,
  addIndex = 0
): EditOverlay {
  if (op.op === "AddBuilding") {
    const building = buildHypotheticalBuilding(op, metresPerStorey, addIndex);
    return {
      ...overlay,
      addedBuildings: [...overlay.addedBuildings, building],
    };
  }

  if (op.op === "ModifyBuilding") {
    const newRepHeight = storeyToMetres(op.heightStoreys, metresPerStorey);
    const modified = new Map(overlay.modifiedClusterHeights);
    modified.set(op.targetClusterId, newRepHeight);
    return { ...overlay, modifiedClusterHeights: modified };
  }

  // RemoveBuilding
  const removed = new Set(overlay.removedClusterIds);
  removed.add(op.targetClusterId);
  return { ...overlay, removedClusterIds: removed };
}

// Exported for tests that need to inspect the produced building directly.
export function buildHypotheticalBuilding(
  op: AddBuildingOp,
  metresPerStorey: number,
  addIndex: number
): HypotheticalBuilding {
  return {
    id: `user-b${addIndex}`,
    clusterId: `user-c${addIndex}`,
    footprint: squareFootprint(op.at),
    heightValue: storeyToMetres(op.heightStoreys, metresPerStorey),
    confidenceKind: "hypothetical",
    origin: "user-edit",
    confidence: { kind: "hypothetical" },
  };
}

// Replays a log of ops from an empty overlay to produce the current overlay.
// Used for undo: pop the last entry from the log, then call replayLog.
export function replayLog(
  log: EditOp[],
  clusterRepHeights: Map<string, number>,
  metresPerStorey: number
): EditOverlay {
  let overlay = emptyOverlay();
  let addCount = 0;
  for (const op of log) {
    overlay = applyOpToOverlay(overlay, op, clusterRepHeights, metresPerStorey, addCount);
    if (op.op === "AddBuilding") addCount++;
  }
  return overlay;
}

// Splits the original building list into rendering-ready real and hypothetical
// lists after applying the overlay. For modified clusters, each member's height
// scales by (newRepHeight / oldRepHeight) to preserve stepped massing.
export function computeEffectiveBuildings(
  originalBuildings: BuildingForScene[],
  clusterRepHeights: Map<string, number>,
  overlay: EditOverlay
): { realBuildings: BuildingForScene[]; hypotheticalBuildings: HypotheticalBuilding[] } {
  const realBuildings: BuildingForScene[] = [];

  for (const b of originalBuildings) {
    if (overlay.removedClusterIds.has(b.clusterId)) continue;

    const newRepHeight = overlay.modifiedClusterHeights.get(b.clusterId);
    if (newRepHeight !== undefined) {
      const oldRepHeight = clusterRepHeights.get(b.clusterId);
      if (oldRepHeight && oldRepHeight > 0) {
        const ratio = newRepHeight / oldRepHeight;
        realBuildings.push({ ...b, heightValue: b.heightValue * ratio });
        continue;
      }
    }

    realBuildings.push(b);
  }

  return {
    realBuildings,
    hypotheticalBuildings: overlay.addedBuildings,
  };
}
