"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { buildStreetGeometry } from "./streetGeometry";
import type { StreetSegment } from "./types";

// The real OSM street grid as flat asphalt ribbons on the ground (grounded data,
// not invented). Static surfaces only; living traffic is Unit 5.
export function Streets({ segments }: { segments: StreetSegment[] }) {
  const mesh = useMemo(() => {
    const geo = buildStreetGeometry(segments);
    const material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color("#0e1014"),
      roughness: 0.62,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
  }, [segments]);

  return <primitive object={mesh} />;
}
