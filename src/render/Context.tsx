"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { buildContextRing } from "./contextRing";

// The surrounding-city backdrop: invented fabric (see context.ts) rendered as
// one BatchedMesh of low, desaturated, fog-bound blocks so the slice reads as a
// piece of a larger Toronto instead of ending at a hard edge. A single box
// geometry is shared across instances because these blocks are copies, unlike
// the real city's unique footprints (ADR-R09 reasoning does not apply here). No
// shadows: the ring sits beyond the shadow camera and exists only as ambiance.
export function Context({
  center,
  innerRadius,
  outerRadius,
  seed = 1337,
}: {
  center: [number, number];
  innerRadius: number;
  outerRadius: number;
  seed?: number;
}) {
  const [cx, cn] = center;

  const mesh = useMemo(() => {
    const blocks = buildContextRing({
      center: [cx, cn],
      innerRadius,
      outerRadius,
      seed,
    });

    // Unit box translated so its base sits on the ground; per-instance scale by
    // height then keeps the base at y=0.
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    const material = new THREE.MeshStandardNodeMaterial({
      roughness: 0.95,
      metalness: 0.0,
    });

    const batched = new THREE.BatchedMesh(
      Math.max(blocks.length, 1),
      box.getAttribute("position").count,
      box.getIndex()!.count,
      material
    );
    batched.castShadow = false;
    batched.receiveShadow = false;

    const geoId = batched.addGeometry(box);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const color = new THREE.Color();

    blocks.forEach((b, i) => {
      const instId = batched.addInstance(geoId);
      euler.set(0, b.rotation, 0);
      q.setFromEuler(euler);
      pos.set(b.cx, 0, -b.cn); // ENU north -> -Z
      scl.set(b.width, b.height, b.depth);
      m.compose(pos, q, scl);
      batched.setMatrixAt(instId, m);
      // Dark, low-saturation warm grey. Fog tints and lifts the distant blocks
      // so the ring dissolves toward the horizon rather than reading as crisp,
      // measured city.
      const r = hash01(i);
      color.setHSL(0.07, 0.05, 0.08 + r * 0.05);
      batched.setColorAt(instId, color);
    });

    return batched;
  }, [cx, cn, innerRadius, outerRadius, seed]);

  return <primitive object={mesh} />;
}

// Deterministic [0,1) jitter from an integer so the look is stable across renders.
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
