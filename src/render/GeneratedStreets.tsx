"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { ribbonData } from "./genStreetGeometry";

// The generated street grid (G3): the centerlines the directive laid, rendered as flat cool-tinted
// ground ribbons so the proposed neighborhood reads as blocks and streets, not just towers. One mesh,
// one draw. Distinct from the real roads (Streets.tsx) by tint and by carrying no flow, since this is
// a proposal, not measured Toronto.
export function GeneratedStreets({ streets }: { streets: [number, number][][] }) {
  const mesh = useMemo(() => {
    if (streets.length === 0) return null;
    const { positions, indices } = ribbonData(streets, 2.5, 0.15);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    const material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0.32, 0.38, 0.5),
      roughness: 0.85,
      metalness: 0.0,
    });
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
  }, [streets]);

  if (!mesh) return null;
  return <primitive object={mesh} />;
}
