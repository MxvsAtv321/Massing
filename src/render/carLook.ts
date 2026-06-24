import * as THREE from "three/webgpu";
import {
  positionLocal,
  instanceIndex,
  float,
  vec3,
  mix,
  smoothstep,
  uniform,
} from "three/tsl";

// Shared visual identity for traffic agents across both render paths (GPU compute
// and CPU fallback): one box geometry and one car colour, so the cars read the same
// wherever they run.

export const CAR_W = 2.2;
export const CAR_H = 1.5;
export const CAR_LEN = 5.0;

// A car is a coloured body with small lights at its two ends, not a glowing block:
// the front ~25% is a cool-white headlight cap, the rear ~25% a red taillight cap,
// and the middle is painted bodywork. Both lamps are HDR so the bloom catches them
// as light trails; the paint stays a steady mid value so the car silhouette reads in
// daylight. The caps are read straight from the car's local Z (depth = travel
// forward), so they need no per-instance data and work unchanged on the CPU path.
const HEAD: [number, number, number] = [1.7, 1.8, 2.1];
const TAIL: [number, number, number] = [2.1, 0.14, 0.05];
const PAINT_DARK = 0.22; // darkest car paint value
const PAINT_LIGHT = 0.92; // lightest car paint value

export function carGeometry(): THREE.BoxGeometry {
  // Depth (z) is the long axis = travel forward; matches the heading rotation in
  // both the GPU positionNode and the CPU Euler aim.
  return new THREE.BoxGeometry(CAR_W, CAR_H, CAR_LEN);
}

// Returns the shared car colour node plus a setter for its lamp gain. The uniform is
// owned here (its inferred node type keeps the TSL math methods) so both render paths
// drive the same look the same way: build the node once, set the gain each frame.
export function headTailColor() {
  const lightU = uniform(1.0);

  // Per-instance paint value from a hash of the instance index: a spread of light to
  // dark greys so a row of cars reads as a varied traffic mix, not identical dashes.
  const rnd = float(instanceIndex).mul(12.9898).sin().mul(43758.5453).fract();
  const v = mix(float(PAINT_DARK), float(PAINT_LIGHT), rnd);
  const body = vec3(v, v, v);

  const nz = positionLocal.z.div(CAR_LEN / 2); // -1 rear .. +1 front
  const headMask = smoothstep(0.45, 0.95, nz); // front cap
  const tailMask = smoothstep(-0.45, -0.95, nz); // rear cap

  const withHead = mix(body, vec3(HEAD[0], HEAD[1], HEAD[2]).mul(lightU), headMask);
  const colorNode = mix(
    withHead,
    vec3(TAIL[0], TAIL[1], TAIL[2]).mul(lightU),
    tailMask
  );

  return {
    colorNode,
    setGain: (gain: number) => {
      lightU.value = gain;
    },
  };
}

// Lamps stay clearly lit by day (so traffic reads against the bright sunlit scene)
// and bloom harder at night. dayFactor is 0 night .. 1 full day.
export function carLightGain(dayFactor: number): number {
  return 0.85 + 0.75 * (1 - clamp01(dayFactor));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
