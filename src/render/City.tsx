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
import { classifyArchetype, archetypeAppearance, footprintArea } from "./materialArchetype";
import { buildFacadeNodes } from "./facade";
import { attribute } from "three/tsl";
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
    // Per-building PBR from the real-attribute archetype (V2): glass, masonry, concrete, metal, baked as
    // vertex attributes so the box positions never change (ADR-R29). Metalness drives the IBL reflection so
    // glass reflects the sky and the golden-hour sun while masonry and concrete read matte.
    material.metalnessNode = attribute("aMetalness");
    // Daytime facade (VD1): the window grid in albedo and roughness, so every building reads as a glazed or
    // masonry facade in daylight rather than a flat box. Material only, all buildings, within the rule; it
    // reads the per-vertex aColor/aRoughness below and modulates them (roofs keep their matte V3 material).
    const facade = buildFacadeNodes(metresPerStorey);
    material.colorNode = facade.colorNode;
    material.roughnessNode = facade.roughnessNode;
    // Relief depth on the window grid (VD2): mullions catch light, panes recess. Material only, faded with
    // distance so far buildings stay flat. Box positions untouched, so the shadow and the scorers are blind
    // to it (ADR-R29).
    material.normalNode = facade.normalNode;
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

    const identity = new THREE.Matrix4();
    const byId = new Map(buildings.map((b) => [b.id, b]));
    geometries.forEach((g, i) => {
      const b = byId.get(ids[i]);
      const arch = b
        ? classifyArchetype(b.heightValue, footprintArea(b.footprint[0] ?? []))
        : "concrete";
      const app = archetypeAppearance(arch);
      // Bake roughness and metalness as per-vertex attributes (box positions untouched, ADR-R29). Walls
      // take the archetype; up-facing roof faces are forced matte and non-metal, so a glass tower does not
      // mirror the sky off its flat top (V3, the within-envelope roof treatment). The silhouette outline
      // stays the canonical box, which the rule fixes; only how the roof reads changes.
      const pos = g.getAttribute("position");
      const nrm = g.getAttribute("normal");
      const count = pos.count;
      const rough = new Float32Array(count);
      const metal = new Float32Array(count);
      for (let v = 0; v < count; v++) {
        const isRoof = nrm ? nrm.getY(v) > 0.5 : false;
        rough[v] = isRoof ? 0.92 : app.roughness;
        metal[v] = isRoof ? 0.0 : app.metalness;
      }
      // The archetype base albedo with a subtle within-archetype jitter, baked per vertex as aColor so the
      // facade colorNode can read and modulate it (a BatchedMesh instance colour cannot reach a node).
      const j = 0.9 + hash01(i) * 0.16;
      const col = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) {
        col[v * 3] = app.color[0] * j;
        col[v * 3 + 1] = app.color[1] * j;
        col[v * 3 + 2] = app.color[2] * j;
      }
      g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      g.setAttribute("aRoughness", new THREE.BufferAttribute(rough, 1));
      g.setAttribute("aMetalness", new THREE.BufferAttribute(metal, 1));

      const geoId = batched.addGeometry(g);
      const instId = batched.addInstance(geoId);
      batched.setMatrixAt(instId, identity); // geometry is already world-placed
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
