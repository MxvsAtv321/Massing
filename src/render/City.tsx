"use client";

import { useMemo, useCallback } from "react";
import * as THREE from "three/webgpu";
import type { ThreeEvent } from "@react-three/fiber";
import { buildBuildingGeometries } from "./cityGeometry";
import {
  buildBuildingClusterMap,
  buildInstanceClusterIds,
  resolveClusterFromBatchId,
} from "./cityIndex";
import { selection } from "./selectionStore";
import type { BuildingForScene } from "../mutation/building";

// The whole static city as one BatchedMesh (ADR-R09): unique per-building
// geometries in a single draw, with per-object identity preserved for later
// selection and mutation.
export function City({ buildings }: { buildings: BuildingForScene[] }) {
  const mesh = useMemo(() => {
    const { geometries, ids } = buildBuildingGeometries(buildings);

    let vertexCount = 0;
    let indexCount = 0;
    for (const g of geometries) {
      vertexCount += g.getAttribute("position").count;
      const idx = g.getIndex();
      indexCount += idx ? idx.count : g.getAttribute("position").count;
    }

    const material = new THREE.MeshStandardNodeMaterial({
      roughness: 0.82,
      metalness: 0.0,
    });

    const batched = new THREE.BatchedMesh(
      geometries.length,
      vertexCount,
      indexCount,
      material
    );
    batched.castShadow = true;
    batched.receiveShadow = true;

    const color = new THREE.Color();
    const identity = new THREE.Matrix4();
    geometries.forEach((g, i) => {
      const geoId = batched.addGeometry(g);
      const instId = batched.addInstance(geoId);
      batched.setMatrixAt(instId, identity); // geometry is already world-placed
      // Subtle warm-grey jitter so a field of prisms does not read as flat grey.
      const r = hash01(i);
      color.setHSL(0.08, 0.05 + r * 0.03, 0.4 + r * 0.16);
      batched.setColorAt(instId, color);
    });

    // instanceId -> clusterId, aligned with the addInstance order above so a
    // raycast batchId resolves straight to a selectable building (4b picking).
    // ids come from cityGeometry in the same filtered order, so this never drifts.
    batched.userData.instanceClusterIds = buildInstanceClusterIds(
      ids,
      buildBuildingClusterMap(buildings)
    );

    return batched;
  }, [buildings]);

  // A click resolves the raycast hit (batchId == instanceId) to its cluster via
  // the userData table built above, with no extra render pass. stopPropagation so
  // the same click is not also seen as a miss.
  const onPick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const ids = (e.object.userData.instanceClusterIds ?? []) as string[];
    selection.select(resolveClusterFromBatchId(e.batchId, ids));
  }, []);

  // A click that misses the city (empty ground, sky) clears the selection.
  const onMiss = useCallback(() => selection.clear(), []);

  return <primitive object={mesh} onClick={onPick} onPointerMissed={onMiss} />;
}

// Deterministic [0,1) jitter from an integer so the look is stable across renders.
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
