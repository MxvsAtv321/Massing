"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three/webgpu";
import { attribute, mul } from "three/tsl";
import { buildStreetGeometry, congestionVertexArray } from "./streetGeometry";
import type { StreetSegment } from "./types";
import type { FlowEngine } from "./flowEngine";

// How hard the per-edge flow colour glows on the asphalt. HDR (> 1) on the busiest
// roads so they bloom; free-flow roads carry near-zero emissive (see flowField).
const FLOW_GAIN = 1.8;

// The real OSM street grid as flat asphalt ribbons on the ground (grounded data,
// not invented). The asphalt is static; the congestion glow on top is the living
// flow field (Unit 5), an emissive read from the per-vertex congestion attribute.
// When the city is edited, the flow engine re-solves and we re-tint in place (5e).
export function Streets({
  segments,
  flow,
}: {
  segments: StreetSegment[];
  flow?: FlowEngine;
}) {
  const mesh = useMemo(() => {
    const geo = buildStreetGeometry(segments);
    const material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color("#0e1014"),
      roughness: 0.62,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    material.emissiveNode = mul(attribute("congestion", "vec3"), FLOW_GAIN);
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
  }, [segments]);

  useEffect(() => {
    if (!flow) return;
    const apply = () => {
      const perStreet = flow.streetCongestion();
      if (!perStreet) return;
      const attr = mesh.geometry.getAttribute("congestion") as THREE.BufferAttribute;
      (attr.array as Float32Array).set(congestionVertexArray(segments, perStreet));
      attr.needsUpdate = true;
    };
    apply(); // pick up any solve that ran before this mounted
    return flow.subscribe(apply);
  }, [flow, mesh, segments]);

  return <primitive object={mesh} />;
}
