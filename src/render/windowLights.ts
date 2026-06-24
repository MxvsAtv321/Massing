import {
  positionGeometry,
  normalLocal,
  hash,
  select,
  smoothstep,
  step,
  abs,
  vec3,
  uniform,
} from "three/tsl";

// Nightfall window lights (Unit 6): a procedural emissive contribution for the city
// material, evaluated in the fragment stage. Windows are a grid laid in object space
// from positionGeometry (the raw vertex position, before the batch Y-scale matrix, so
// it is the true height-above-grade in metres and does not stretch under a height
// edit, ADR-R11). Walls are masked from roofs by normal; each cell is lit/unlit by a
// stable hash so the scatter is mostly dark and varies building to building (the world
// coords baked into the geometry de-correlate it for free). The whole term ramps on at
// dusk via the shared daylightLive factor and sits above 1.0 so the existing bloom
// catches it. No new geometry, no draw call, no compute: pure material math, identical
// on both backends. The buildings stay the subject; this lights the massing itself.

export type WindowDefaults = {
  floorPitch: number; // metres per window row; ties to metresPerStorey
  bayPitch: number; // metres per window column
  litFraction: number; // fraction of windows lit (< 0.5: mostly dark)
  emissivePeak: number; // HDR peak emissive of a lit pane (> 1: blooms)
  paneInsetV: [number, number]; // lit band within a cell, vertical
  paneInsetH: [number, number]; // lit band within a cell, horizontal
  warmPale: [number, number, number]; // window tint (warm white)
  rampStart: number; // dayFactor at/below which windows are full on
  rampEnd: number; // dayFactor at/above which windows are off
};

export const WINDOW_DEFAULTS: WindowDefaults = {
  floorPitch: 3.0,
  bayPitch: 4.0,
  litFraction: 0.28,
  emissivePeak: 2.2,
  paneInsetV: [0.18, 0.82],
  paneInsetH: [0.22, 0.78],
  warmPale: [1.0, 0.82, 0.55],
  rampStart: 0.05,
  rampEnd: 0.35,
};

const PANE_SOFT = 0.06; // soft edge on the pane bands, in cell units

export type WindowNodeOptions = {
  metresPerStorey?: number; // drives floorPitch when provided
  defaults?: Partial<WindowDefaults>;
};

export function buildWindowEmissiveNode(opts: WindowNodeOptions = {}) {
  const d: WindowDefaults = { ...WINDOW_DEFAULTS, ...(opts.defaults ?? {}) };
  const floorPitch = opts.metresPerStorey ?? d.floorPitch;
  const nightU = uniform(0);

  const pos = positionGeometry;
  const nrm = normalLocal;

  // Wall faces only; roofs and the base cap stay dark.
  const wall = smoothstep(0.5, 0.2, abs(nrm.y));

  // Along-wall coordinate: a wall facing mostly X runs along Z, and vice versa.
  const horiz = select(abs(nrm.x).greaterThan(abs(nrm.z)), pos.z, pos.x);
  const floorC = pos.y.div(floorPitch);
  const bayC = horiz.div(d.bayPitch);

  const floorIdx = floorC.floor();
  const bayIdx = bayC.floor();
  const localV = floorC.fract();
  const localH = bayC.fract();

  // A rectangular pane inside each cell: a soft band vertically and horizontally,
  // leaving a dark mullion frame between windows.
  const bandV = smoothstep(d.paneInsetV[0], d.paneInsetV[0] + PANE_SOFT, localV).mul(
    smoothstep(d.paneInsetV[1], d.paneInsetV[1] - PANE_SOFT, localV)
  );
  const bandH = smoothstep(d.paneInsetH[0], d.paneInsetH[0] + PANE_SOFT, localH).mul(
    smoothstep(d.paneInsetH[1], d.paneInsetH[1] - PANE_SOFT, localH)
  );
  const pane = bandV.mul(bandH);

  // Stable per-cell hash -> lit if it lands in the top litFraction of [0,1). The
  // +512 offset keeps the seed positive for cells west/south of the ENU origin.
  const seed = floorIdx.mul(1973).add(bayIdx.add(512).mul(9277));
  const lit = step(1 - d.litFraction, hash(seed));

  const warm = vec3(d.warmPale[0], d.warmPale[1], d.warmPale[2]);
  const emissiveNode = warm
    .mul(d.emissivePeak)
    .mul(wall)
    .mul(pane)
    .mul(lit)
    .mul(nightU);

  return {
    emissiveNode,
    setNight: (dayFactor: number) => {
      nightU.value = windowNightGain(dayFactor, d);
    },
  };
}

// ---------------------------------------------------------------------------
// Pure, THREE-free mirrors of the node math, unit-tested in node. The TSL node
// above implements the same logic; these pin the behaviour without a GPU.
// ---------------------------------------------------------------------------

// Dusk ramp: 1 at night, 0 by day, smooth across the twilight window.
export function windowNightGain(
  dayFactor: number,
  d: WindowDefaults = WINDOW_DEFAULTS
): number {
  return smoothstepScalar(d.rampEnd, d.rampStart, dayFactor);
}

// Deterministic [0, 1) hash for a window cell. Uniform enough that thresholding it
// yields the intended lit fraction; not required to match the GPU hash bit for bit.
export function windowSeed(
  floorIndex: number,
  bayIndex: number,
  buildingSeed = 0
): number {
  let s =
    (Math.floor(floorIndex) * 1973 +
      (Math.floor(bayIndex) + 512) * 9277 +
      buildingSeed * 131) >>>
    0;
  s = Math.imul(s ^ (s >>> 15), 1 | s);
  s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}

export function isWindowLit(seed: number, litFraction: number): boolean {
  return seed >= 1 - litFraction;
}

// The 0..1 pane mask from local cell coords (mirror of bandV * bandH).
export function paneMask(
  localV: number,
  localH: number,
  d: WindowDefaults = WINDOW_DEFAULTS
): number {
  const bandV =
    smoothstepScalar(d.paneInsetV[0], d.paneInsetV[0] + PANE_SOFT, localV) *
    smoothstepScalar(d.paneInsetV[1], d.paneInsetV[1] - PANE_SOFT, localV);
  const bandH =
    smoothstepScalar(d.paneInsetH[0], d.paneInsetH[0] + PANE_SOFT, localH) *
    smoothstepScalar(d.paneInsetH[1], d.paneInsetH[1] - PANE_SOFT, localH);
  return bandV * bandH;
}

// Wall vs cap from a normal's |y|: 1 on a vertical wall, 0 on a flat cap.
export function wallMask(absNormalY: number): number {
  return smoothstepScalar(0.5, 0.2, absNormalY);
}

// Floor coordinate under a live height-edit ratio (used by the node in 6.4): the
// world floor pitch is floorPitch * ratio, so dividing by it keeps rows a constant
// real height and makes a taller building gain rows rather than stretch them.
export function floorCoord(
  positionY: number,
  floorPitch: number,
  ratio: number
): number {
  return positionY / (floorPitch * Math.max(ratio, 1e-3));
}

function smoothstepScalar(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
