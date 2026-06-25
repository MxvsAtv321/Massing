"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { buildContextRing } from "./contextRing";

// The surrounding-city backdrop: invented fabric (see context.ts) rendered as
// one InstancedMesh of low, desaturated, fog-bound blocks so the slice reads as a
// piece of a larger Toronto instead of ending at a hard edge. A single box
// geometry is shared because these blocks are copies, unlike the real city's
// unique footprints (ADR-R09 reasoning does not apply here): copies are exactly
// the InstancedMesh case, one instanced draw for the whole ring. A BatchedMesh
// here was wrong, because on the WebGPU backend BatchedMesh emits one drawIndexed
// per sub-instance (no multi-draw, see ADR-R15), so the ring cost hundreds of
// draw calls. No shadows: the ring sits beyond the shadow camera, pure ambiance.
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

    if (blocks.length === 0) return null;

    // Unit box translated so its base sits on the ground; per-instance scale by
    // height then keeps the base at y=0.
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    const material = new THREE.MeshStandardNodeMaterial({
      roughness: 0.95,
      metalness: 0.0,
    });

    const instanced = new THREE.InstancedMesh(box, material, blocks.length);
    instanced.castShadow = false;
    instanced.receiveShadow = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const color = new THREE.Color();

    blocks.forEach((b, i) => {
      euler.set(0, b.rotation, 0);
      q.setFromEuler(euler);
      pos.set(b.cx, 0, -b.cn); // ENU north -> -Z
      scl.set(b.width, b.height, b.depth);
      m.compose(pos, q, scl);
      instanced.setMatrixAt(i, m);
      // Dark, low-saturation warm grey. Fog tints and lifts the distant blocks
      // so the ring dissolves toward the horizon rather than reading as crisp,
      // measured city.
      const r = hash01(i);
      color.setHSL(0.07, 0.05, 0.08 + r * 0.05);
      instanced.setColorAt(i, color);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    // Bound the sphere from the instanced transforms so the whole ring can still
    // frustum-cull as one unit when the camera looks away from it.
    instanced.computeBoundingSphere();

    return instanced;
  }, [cx, cn, innerRadius, outerRadius, seed]);

  if (!mesh) return null;
  return <primitive object={mesh} />;
}

// Deterministic [0,1) jitter from an integer so the look is stable across renders.
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
