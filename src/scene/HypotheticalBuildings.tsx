"use client";

import { useMemo, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
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

  // RemoveBuilding: red tint preview.
  const members = originalBuildings.filter(
    (b) => b.clusterId === pendingOp.targetClusterId
  );
  return { buildings: members, isRemoval: true };
}

// ─── Per-building applied mesh with click handler ─────────────────────────────

type AppliedMeshProps = {
  building: HypotheticalBuilding;
  onBuildingClick?: (clusterId: string, heightM: number) => void;
};

function AppliedHypoMesh({ building, onBuildingClick }: AppliedMeshProps) {
  const geo = useMemo(() => buildMergedGeometry([building]), [building]);
  useEffect(() => () => { geo?.dispose(); }, [geo]);

  if (!geo) return null;
  return (
    <mesh
      geometry={geo}
      castShadow
      receiveShadow
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onBuildingClick?.(building.clusterId, building.heightValue);
      }}
    >
      <meshStandardMaterial
        color="#d4900a"
        roughness={0.75}
        metalness={0.05}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  pendingOp: EditOp | null;
  appliedBuildings: HypotheticalBuilding[];
  originalBuildings: BuildingForScene[];
  clusterRepHeights: Map<string, number>;
  metresPerStorey: number;
  onBuildingClick?: (clusterId: string, heightM: number) => void;
};

export function HypotheticalBuildings({
  pendingOp,
  appliedBuildings,
  originalBuildings,
  clusterRepHeights,
  metresPerStorey,
  onBuildingClick,
}: Props) {
  const { gl } = useThree();

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, pendingOp, appliedBuildings]);

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
      {appliedBuildings.map((b) => (
        <AppliedHypoMesh key={b.id} building={b} onBuildingClick={onBuildingClick} />
      ))}

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
