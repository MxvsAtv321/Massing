"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { buildRoadRibbons, type RoadEdgeForScene } from "./roadGeometry";

// Quiet ground-level street overlay. Two merged meshes (arterials, local streets) in
// muted warm greys that sit between the olive ground and the lighter buildings. Roads
// receive the buildings' shadows so the overlay ties into the shadow hero; they do not
// cast (they are effectively flat).
export function RoadNetwork({
  edges,
  visible,
}: {
  edges: RoadEdgeForScene[];
  visible: boolean;
}) {
  const { gl } = useThree();

  const arterial = useMemo(() => buildRoadRibbons(edges, "arterial"), [edges]);
  const local = useMemo(() => buildRoadRibbons(edges, "local"), [edges]);

  useEffect(() => () => arterial?.dispose(), [arterial]);
  useEffect(() => () => local?.dispose(), [local]);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, arterial, local, visible]);

  if (!visible) return null;

  return (
    <>
      {local && (
        <mesh geometry={local} receiveShadow>
          <meshStandardMaterial
            color="#6b6358"
            roughness={1}
            metalness={0}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}
      {arterial && (
        <mesh geometry={arterial} receiveShadow>
          <meshStandardMaterial
            color="#857c6f"
            roughness={1}
            metalness={0}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}
    </>
  );
}
