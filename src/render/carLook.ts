import * as THREE from "three/webgpu";
import { positionLocal, vec3, mix, smoothstep, uniform } from "three/tsl";

// Shared visual identity for traffic agents across both render paths (GPU compute
// and CPU fallback): one box geometry and one head/tail-light colour, so the cars
// read the same wherever they run.

export const CAR_W = 2.0;
export const CAR_H = 1.4;
export const CAR_LEN = 4.6;

// Cool-white headlights lead, warm-red taillights trail, both HDR so the bloom
// catches them as light trails. The split is read straight from the car's local Z
// (depth = travel forward), so it needs no per-instance data and works unchanged on
// the CPU path. The body between the lamps blends red->white along the length, which
// at city scale reads as a moving light streak, the iconic night-traffic look.
const HEAD: [number, number, number] = [1.3, 1.45, 1.8];
const TAIL: [number, number, number] = [1.9, 0.16, 0.07];

export function carGeometry(): THREE.BoxGeometry {
  // Depth (z) is the long axis = travel forward; matches the heading rotation in
  // both the GPU positionNode and the CPU Euler aim.
  return new THREE.BoxGeometry(CAR_W, CAR_H, CAR_LEN);
}

// Returns the shared head/tail colour node plus a setter for its light gain. The
// uniform is owned here (its inferred node type keeps the TSL math methods) so both
// render paths drive the same look the same way: build the node once, set the gain
// each frame.
export function headTailColor() {
  const lightU = uniform(1.0);
  const nz = positionLocal.z.div(CAR_LEN / 2); // -1 rear .. +1 front
  const t = smoothstep(-0.15, 0.15, nz);
  const colorNode = mix(
    vec3(TAIL[0], TAIL[1], TAIL[2]),
    vec3(HEAD[0], HEAD[1], HEAD[2]),
    t
  ).mul(lightU);
  return {
    colorNode,
    setGain: (gain: number) => {
      lightU.value = gain;
    },
  };
}

// Lamps are faint by day and bloom at night. dayFactor is 0 night .. 1 full day.
export function carLightGain(dayFactor: number): number {
  return 0.3 + 0.9 * (1 - clamp01(dayFactor));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
