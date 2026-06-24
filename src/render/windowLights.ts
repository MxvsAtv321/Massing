import {
  positionWorld,
  normalLocal,
  hash,
  select,
  smoothstep,
  step,
  abs,
  mix,
  vec3,
  uniform,
} from "three/tsl";

// Nightfall window lights (Unit 6): a procedural emissive contribution for the city
// material, evaluated in the fragment stage. Windows are a grid laid from positionWorld
// (the post-transform world position, which carries the per-instance Y-scale that a
// height edit applies, ADR-R11). Keying the floor rows off world height means a raised
// building gains more rows of windows as it grows, rather than stretching the existing
// ones: positionWorld.y = the geometry's real metres times the edit ratio, so floors
// fill in. At rest (ratio 1) it equals the raw geometry height, so the look is
// unchanged. Walls are masked from roofs by normal; each cell is lit/unlit by a stable
// hash so the scatter is mostly dark and varies building to building (world coords
// de-correlate it for free). The term ramps on at dusk via the shared daylightLive
// factor and sits above 1.0 so the existing bloom catches it. No new geometry, no draw
// call, no compute: pure material math, identical on both backends. The buildings stay
// the subject; this lights the massing itself.

export type WindowDefaults = {
  floorPitch: number; // metres per window row; ties to metresPerStorey
  bayPitch: number; // metres per window column
  litFraction: number; // fraction of windows lit (< 0.5: mostly dark)
  emissivePeak: number; // HDR peak emissive of a lit pane (> 1: blooms)
  paneInsetV: [number, number]; // lit band within a cell, vertical
  paneInsetH: [number, number]; // lit band within a cell, horizontal
  warmHot: [number, number, number]; // deep amber tint
  warmPale: [number, number, number]; // pale warm-white tint
  coolTint: [number, number, number]; // rare fluorescent/TV blue accent
  coolFraction: number; // fraction of lit windows that read cool
  brightJitter: number; // per-window emissive jitter, +/- this fraction
  dynamicFraction: number; // fraction of windows that slowly switch over the night
  toggleRate: number; // switch ticks per second (low: occasional, not a flicker)
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
  warmHot: [1.0, 0.6, 0.28],
  warmPale: [1.0, 0.85, 0.6],
  coolTint: [0.75, 0.86, 1.05],
  coolFraction: 0.07,
  brightJitter: 0.3,
  dynamicFraction: 0.1,
  toggleRate: 0.05, // a window can change at most ~every 20s, staggered per window
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
  const timeU = uniform(0); // seconds, for the slow occasional on/off

  const pos = positionWorld;
  const nrm = normalLocal;

  // Wall faces only; roofs and the base cap stay dark.
  const wall = smoothstep(0.5, 0.2, abs(nrm.y));

  // Along-wall coordinate: a wall facing mostly X runs along Z, and vice versa. X and
  // Z are unscaled by a height edit, so bays stay put; only the floor rows below grow.
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

  // Stable per-cell seed. The +512 offset keeps it positive for cells west/south of
  // the ENU origin; the world coords baked into bayIdx de-correlate it between
  // buildings. Distinct integer offsets give independent rolls per purpose (the GPU
  // hash truncates its seed to a uint, so offsets must be whole numbers).
  const seed = floorIdx.mul(1973).add(bayIdx.add(512).mul(9277));

  // Lit/unlit. Most windows hold their state all night (the static roll); a small
  // dynamicFraction slowly re-roll on a staggered, low-rate tick so the odd window
  // switches on or off now and then, never a flicker.
  const rBase = hash(seed);
  const dynamic = step(1 - d.dynamicFraction, hash(seed.add(31)));
  const phase = hash(seed.add(91));
  const tick = timeU.mul(d.toggleRate).add(phase).floor();
  const rTime = hash(seed.add(tick.mul(977)));
  const lit = step(1 - d.litFraction, mix(rBase, rTime, dynamic));

  // Per-window colour: mostly a warm amber-to-white spread, a rare cool accent, with
  // a small per-window brightness jitter so the lit panes are not uniform.
  const warm = mix(
    vec3(d.warmHot[0], d.warmHot[1], d.warmHot[2]),
    vec3(d.warmPale[0], d.warmPale[1], d.warmPale[2]),
    hash(seed.add(57))
  );
  const cool = step(1 - d.coolFraction, hash(seed.add(131)));
  const tint = mix(warm, vec3(d.coolTint[0], d.coolTint[1], d.coolTint[2]), cool);
  const jitter = hash(seed.add(211)).mul(d.brightJitter * 2).add(1 - d.brightJitter);

  const emissiveNode = tint
    .mul(d.emissivePeak)
    .mul(jitter)
    .mul(wall)
    .mul(pane)
    .mul(lit)
    .mul(nightU);

  return {
    emissiveNode,
    update: (dayFactor: number, timeSeconds: number) => {
      nightU.value = windowNightGain(dayFactor, d);
      timeU.value = timeSeconds;
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

// Floor coordinate under a live height-edit ratio. Mirrors the node, which keys off
// positionWorld.y = the raw geometry height (positionY) times the edit ratio. So a
// taller building (larger ratio) yields a larger coordinate and thus more rows below
// a given vertex: floors fill in rather than the existing windows stretching.
export function floorCoord(
  positionY: number,
  floorPitch: number,
  ratio: number
): number {
  return (positionY * ratio) / floorPitch;
}

function smoothstepScalar(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
