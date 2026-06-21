"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";

// Flat ENU ground plane with a PBR material, sized to the model. The flat plane
// stays (ADR-002, carried) as the receiver and agent substrate.
export function Ground({ radius }: { radius: number }) {
  const size = Math.max(radius * 6, 600);
  const material = useMemo(
    () =>
      new THREE.MeshStandardNodeMaterial({
        color: new THREE.Color("#15171b"),
        roughness: 0.96,
        metalness: 0.0,
      }),
    []
  );

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow material={material}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
