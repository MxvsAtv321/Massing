"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three/webgpu";
import { useFrame } from "@react-three/fiber";
import { massingInstances, type BoxInstance } from "../generate/instances";
import { assemblyDelays, assemblyScale, type AssemblyParams } from "../generate/assembly";
import type { MassingPlacement } from "../generate/massing";

// The agent-authored proposal, rendered as InstancedMesh box templates (ADR-R18): one instanced draw
// for the towers and one for the podiums. The district assembles on a directive: each tower rises from
// the ground via a per-instance Y-scale, staggered as a sweep (src/generate/assembly). The crux for
// perf (G3): the InstancedMesh is built once and only its matrices animate in useFrame, so there is no
// buffer growth and no rebuild, which is how the assembly holds 60 fps. A cool tint marks it as a
// proposal, not measured Toronto; the line is held by register and the measured study (ADR-R19).

const ASSEMBLY: AssemblyParams = { durationS: 3.2, riseS: 0.9, jitterS: 0.25 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

export function GeneratedCity({ massing }: { massing: MassingPlacement[] }) {
  const built = useMemo(() => {
    if (massing.length === 0) return null;
    const { boxes, podiums } = massingInstances(massing);
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.1 });
    const tower = makeInstanced(geo, material, boxes);
    const podium = podiums.length > 0 ? makeInstanced(geo, material, podiums) : null;
    const towerDelays = assemblyDelays(boxes, ASSEMBLY, 1);
    const podiumDelays = podium ? assemblyDelays(podiums, ASSEMBLY, 2) : [];
    // Start flat so there is no full-height flash before the first animated frame.
    applyScale(tower, boxes, towerDelays, 0);
    if (podium) applyScale(podium, podiums, podiumDelays, 0);
    return { tower, podium, boxes, podiums, towerDelays, podiumDelays };
  }, [massing]);

  // Reset the assembly clock whenever a new proposal is built.
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    startRef.current = null;
  }, [built]);

  useFrame((state) => {
    if (!built) return;
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - startRef.current;
    if (t > ASSEMBLY.durationS + 0.2) return; // assembled; matrices already at full
    applyScale(built.tower, built.boxes, built.towerDelays, t);
    if (built.podium) applyScale(built.podium, built.podiums, built.podiumDelays, t);
  });

  if (!built) return null;
  return (
    <>
      <primitive object={built.tower} />
      {built.podium && <primitive object={built.podium} />}
    </>
  );
}

// Build the InstancedMesh at full scale (so the bounding sphere is correct) with the cool tint.
function makeInstanced(
  geo: THREE.BoxGeometry,
  material: THREE.MeshStandardNodeMaterial,
  instances: BoxInstance[]
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, instances.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const color = new THREE.Color();
  for (let i = 0; i < instances.length; i++) {
    const b = instances[i];
    _euler.set(0, b.rotation, 0);
    _q.setFromEuler(_euler);
    _pos.set(b.cx, 0, -b.cn); // ENU north -> -Z
    _scl.set(b.width, b.height, b.depth);
    _m.compose(_pos, _q, _scl);
    mesh.setMatrixAt(i, _m);
    const r = hash01(i);
    color.setHSL(0.56, 0.18, 0.5 + r * 0.12);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// Set every instance's Y-scale to its assembly height at time t.
function applyScale(
  mesh: THREE.InstancedMesh,
  instances: BoxInstance[],
  delays: number[],
  t: number
): void {
  for (let i = 0; i < instances.length; i++) {
    const b = instances[i];
    const s = assemblyScale(t, delays[i], ASSEMBLY.riseS);
    _euler.set(0, b.rotation, 0);
    _q.setFromEuler(_euler);
    _pos.set(b.cx, 0, -b.cn);
    _scl.set(b.width, Math.max(b.height * s, 1e-4), b.depth);
    _m.compose(_pos, _q, _scl);
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
