"use client";

import { useMemo, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildMergedGeometry, type BuildingForScene } from "./buildings";
import { buildHypotheticalBuilding, type HypotheticalBuilding } from "../mutation/applyEdit";
import { storeyToMetres, type EditOp } from "../mutation/editOp";

// ─── Preview geometry builder ─────────────────────────────────────────────────

function buildPreviewBuildings(
  pendingOp: EditOp,
  originalBuildings: BuildingForScene[],
  clusterRepHeights: Map<string, number>,
  metresPerStorey: number
): { buildings: BuildingForScene[]; isRemoval: boolean } {
  if (pendingOp.op === "AddBuilding") {
    // Use a sentinel addIndex (won't collide with applied buildings).
    const b = buildHypotheticalBuilding(pendingOp, metresPerStorey, 99999);
    return { buildings: [b], isRemoval: false };
  }

  if (pendingOp.op === "ModifyBuilding") {
    const oldRep = clusterRepHeights.get(pendingOp.targetClusterId) ?? 1;
    const newRep = storeyToMetres(pendingOp.heightStoreys, metresPerStorey);
    const ratio = newRep / oldRep;
    const members = originalBuildings
      .filter((b) => b.clusterId === pendingOp.targetClusterId)
      .map((b) => ({ ...b, heightValue: b.heightValue * ratio }));
    return { buildings: members, isRemoval: false };
  }

  // RemoveBuilding: show original cluster with red tint to signal removal.
  const members = originalBuildings.filter(
    (b) => b.clusterId === pendingOp.targetClusterId
  );
  return { buildings: members, isRemoval: true };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  pendingOp: EditOp | null;
  appliedBuildings: HypotheticalBuilding[];
  originalBuildings: BuildingForScene[];
  clusterRepHeights: Map<string, number>;
  metresPerStorey: number;
};

export function HypotheticalBuildings({
  pendingOp,
  appliedBuildings,
  originalBuildings,
  clusterRepHeights,
  metresPerStorey,
}: Props) {
  const { gl } = useThree();

  // ── Shadow update ──────────────────────────────────────────────────────────
  // Must fire whenever ghost or applied list changes, not only on Apply,
  // because autoUpdate=false means the shadow map only refreshes on needsUpdate.
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, pendingOp, appliedBuildings]);

  // ── Applied hypothetical buildings (solid amber) ───────────────────────────
  const appliedGeo = useMemo(
    () => buildMergedGeometry(appliedBuildings),
    [appliedBuildings]
  );
  useEffect(() => () => { appliedGeo?.dispose(); }, [appliedGeo]);

  // ── Preview ghost ──────────────────────────────────────────────────────────
  const preview = useMemo(() => {
    if (!pendingOp) return null;
    return buildPreviewBuildings(pendingOp, originalBuildings, clusterRepHeights, metresPerStorey);
  }, [pendingOp, originalBuildings, clusterRepHeights, metresPerStorey]);

  const previewGeo = useMemo(
    () => (preview ? buildMergedGeometry(preview.buildings) : null),
    [preview]
  );
  useEffect(() => () => { previewGeo?.dispose(); }, [previewGeo]);

  return (
    <>
      {/* Applied user-added buildings */}
      {appliedGeo && (
        <mesh geometry={appliedGeo} castShadow receiveShadow>
          <meshStandardMaterial
            color="#d4900a"
            roughness={0.75}
            metalness={0.05}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      {/* Preview ghost — amber for add/modify, red for remove */}
      {previewGeo && preview && (
        <mesh geometry={previewGeo} castShadow receiveShadow>
          <meshStandardMaterial
            color={preview.isRemoval ? "#cc3300" : "#f0a820"}
            roughness={0.7}
            metalness={0.0}
            transparent
            opacity={preview.isRemoval ? 0.40 : 0.45}
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>
      )}
    </>
  );
}
