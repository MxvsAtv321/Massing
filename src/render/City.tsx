"use client";

import { useMemo, useCallback, useRef } from "react";
import * as THREE from "three/webgpu";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { buildBuildingGeometries } from "./cityGeometry";
import {
  buildBuildingClusterMap,
  buildInstanceClusterIds,
  resolveClusterFromBatchId,
} from "./cityIndex";
import { selection } from "./selectionStore";
import { editRatios } from "./editRatios";
import { buildWindowEmissiveNode } from "./windowLights";
import { daylightLive } from "./daylightStore";
import type { BuildingForScene } from "../mutation/building";

// The whole static city as one BatchedMesh (ADR-R09): unique per-building
// geometries in a single draw, with per-object identity preserved for later
// selection and mutation.
export function City({
  buildings,
  metresPerStorey,
}: {
  buildings: BuildingForScene[];
  metresPerStorey: number;
}) {
  const { mesh, clusterInstances, updateWindows } = useMemo(() => {
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
    // Nightfall window lights (Unit 6): emissive procedural windows that ramp on at
    // dusk via the shared daylight factor and bloom in the existing post stack. Floor
    // pitch is the model's real storey height, so window rows align to storeys.
    const windows = buildWindowEmissiveNode({ metresPerStorey });
    material.emissiveNode = windows.emissiveNode;

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
    const instanceClusterIds = buildInstanceClusterIds(
      ids,
      buildBuildingClusterMap(buildings)
    );
    batched.userData.instanceClusterIds = instanceClusterIds;

    // Inverse map clusterId -> instanceIds, so a height edit can scale every
    // instance of a cluster (podium + shaft) together.
    const clusterInstances = new Map<string, number[]>();
    instanceClusterIds.forEach((cid, instId) => {
      if (!cid) return;
      const arr = clusterInstances.get(cid);
      if (arr) arr.push(instId);
      else clusterInstances.set(cid, [instId]);
    });

    return { mesh: batched, clusterInstances, updateWindows: windows.update };
  }, [buildings, metresPerStorey]);

  // Apply per-cluster height edits as per-instance Y-scale matrices (ADR-R11):
  // the grounded geometry is never rebuilt, so identity, culling, and shadows
  // survive and there is no rebuild stutter. Only edited or dragged clusters are
  // touched, and idle frames are skipped via the editRatios version counter.
  const applied = useRef<Set<string>>(new Set());
  const lastVersion = useRef(-1);
  const scaleMatrix = useRef(new THREE.Matrix4());
  useFrame((state) => {
    // Ramp the window lights with the live daylight factor and feed the clock for the
    // slow occasional on/off, every frame, before the edit early-out below (which only
    // runs when something is actually being edited).
    updateWindows(daylightLive.dayFactor, state.clock.elapsedTime);

    const v = editRatios.version();
    const dragging = editRatios.draggingCluster();
    if (v === lastVersion.current && dragging === null) return;
    lastVersion.current = v;

    const target = new Set(editRatios.committedClusterIds());
    if (dragging) target.add(dragging);

    const next = new Set<string>();
    const m = scaleMatrix.current;
    for (const cid of new Set([...target, ...applied.current])) {
      const insts = clusterInstances.get(cid);
      if (!insts) continue;
      const ratio = editRatios.ratioFor(cid);
      m.makeScale(1, ratio, 1);
      for (const instId of insts) mesh.setMatrixAt(instId, m);
      if (ratio !== 1) next.add(cid);
    }
    applied.current = next;
  });

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
