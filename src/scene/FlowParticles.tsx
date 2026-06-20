"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { sampleAlongPolyline, particleCountForVolume } from "./particleGeometry";
import { congestionColor } from "./flowGeometry";
import type { RoutableEdge } from "../traffic/routableGraph";
import type { FlowResult } from "../traffic/assignment";

const PARTICLE_Y = 1.6; // ride just above the flow ribbons
const MIN_VOL = 50; // do not animate near-empty edges
const MIN_SPEED_KPH = 3; // jammed links still creep, never freeze

type ParticleEdge = {
  poly: [number, number][];
  lengthM: number;
  speedMps: number;
  color: [number, number, number];
};
type Particle = { edge: number; phase: number };

// Live flow animation: one instanced mesh of particles riding the directed edges from
// origin to destination, density by simulated volume and speed by congested speed (so
// jammed streets crawl), colored by congestion. Illustrative of the flow, not real cars.
export function FlowParticles({
  edges,
  flow,
  visible,
}: {
  edges: RoutableEdge[];
  flow: FlowResult | null;
  visible: boolean;
}) {
  const { pedges, particles } = useMemo(() => {
    const pedges: ParticleEdge[] = [];
    const particles: Particle[] = [];
    if (flow) {
      for (const e of edges) {
        const ef = flow.perEdge.get(e.id);
        if (!ef || ef.volumeMid <= MIN_VOL) continue;
        let len = 0;
        for (let i = 1; i < e.geometry.length; i++) {
          len += Math.hypot(e.geometry[i][0] - e.geometry[i - 1][0], e.geometry[i][1] - e.geometry[i - 1][1]);
        }
        if (len <= 0) continue;
        const n = particleCountForVolume(ef.volumeMid);
        const idx = pedges.length;
        pedges.push({
          poly: e.geometry,
          lengthM: len,
          speedMps: Math.max(MIN_SPEED_KPH, ef.speedMidKph) / 3.6,
          color: congestionColor(ef.vcMid),
        });
        for (let k = 0; k < n; k++) particles.push({ edge: idx, phase: (k + Math.random()) / n });
      }
    }
    return { pedges, particles };
  }, [edges, flow]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const phases = useMemo(() => particles.map((p) => p.phase), [particles]);

  // Set per-instance color and initial position once after (re)mount.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || particles.length === 0) return;
    const c = new THREE.Color();
    for (let i = 0; i < particles.length; i++) {
      const pe = pedges[particles[i].edge];
      c.setRGB(pe.color[0], pe.color[1], pe.color[2]);
      mesh.setColorAt(i, c);
      const [e0, n0] = sampleAlongPolyline(pe.poly, phases[i]);
      dummy.position.set(e0, PARTICLE_Y, -n0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [particles, pedges, phases, dummy]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !visible || particles.length === 0) return;
    const dt = Math.min(delta, 0.1);
    for (let i = 0; i < particles.length; i++) {
      const pe = pedges[particles[i].edge];
      let ph = phases[i] + (pe.speedMps * dt) / pe.lengthM;
      ph -= Math.floor(ph);
      phases[i] = ph;
      const [e0, n0] = sampleAlongPolyline(pe.poly, ph);
      dummy.position.set(e0, PARTICLE_Y, -n0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!visible || particles.length === 0) return null;

  return (
    <instancedMesh key={particles.length} ref={meshRef} args={[undefined, undefined, particles.length]}>
      <sphereGeometry args={[2.4, 6, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
