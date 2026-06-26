"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { massingInstances, type BoxInstance } from "../generate/instances";
import type { MassingPlacement } from "../generate/massing";

// The agent-authored proposal, rendered as InstancedMesh box templates (ADR-R18, ADR-R15): one
// instanced draw for all the towers and one for the podiums, so the district grows by instance count
// with no rebuild stutter, the opposite choice from the real city's BatchedMesh (whose footprints are
// unique). The mapping mirrors Context.tsx exactly (unit box on the ground, per-instance compose,
// ENU north -> -Z). A cool, faintly luminous tint marks it as a proposal, not measured Toronto: the
// line is held by register and the measured sun study, never by making it look fake (ADR-R19).
export function GeneratedCity({ massing }: { massing: MassingPlacement[] }) {
  const meshes = useMemo(() => {
    if (massing.length === 0) return null;
    const { boxes, podiums } = massingInstances(massing);
    // One box translated so its base sits on the ground; per-instance Y-scale by height keeps it there.
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.1 });
    return {
      tower: buildInstanced(geo, material, boxes),
      podium: podiums.length > 0 ? buildInstanced(geo, material, podiums) : null,
    };
  }, [massing]);

  if (!meshes) return null;
  return (
    <>
      <primitive object={meshes.tower} />
      {meshes.podium && <primitive object={meshes.podium} />}
    </>
  );
}

function buildInstanced(
  geo: THREE.BoxGeometry,
  material: THREE.MeshStandardNodeMaterial,
  instances: BoxInstance[]
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, instances.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();

  instances.forEach((b, i) => {
    euler.set(0, b.rotation, 0);
    q.setFromEuler(euler);
    pos.set(b.cx, 0, -b.cn); // ENU north -> -Z, the shared axis map
    scl.set(b.width, b.height, b.depth);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    const r = hash01(i);
    color.setHSL(0.56, 0.18, 0.5 + r * 0.12); // cool, light, a touch of variation
    mesh.setColorAt(i, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
