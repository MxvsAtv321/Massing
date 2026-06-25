// Sun-access / shadow study (Unit 8): the pure type surface. This module and its
// siblings in src/study are THREE-free so they unit-test in node, mirroring the
// solar/daylight split. The render shell in src/render/Study*.tsx drives the GPU
// rig and reads these results. Nothing here invents a height or a sun: the study
// runs on real measured geometry under the real astronomy-engine sun, and is
// presented as a live exploratory study, never a stamped report (ADR-R16).

// The bylaw study configuration. Times are Toronto-zoned minutes of day, consumed
// through the kept solar core. The date defaults to the autumn equinox, the window
// to Toronto's tall-building shadow-study hours.
export type StudyConfig = {
  isoDate: string; // "2026-09-21" equinox default; closes the Lighting DATE TODO
  windowStartMin: number; // 558  (9:18)
  windowEndMin: number; // 1098 (18:18)
  stepMin: number; // 20 on WebGPU, 45 on the WebGL2 fallback
  resolution: number; // 256 on WebGPU, 128 on the fallback
};

// One time sample: the sun for an instant in the window. A sample below the working
// altitude contributes no sunlight (shadow lengths are unreliable near the horizon).
export type SunHoursSample = {
  minutesOfDay: number;
  altitudeDeg: number;
  azimuthDeg: number;
  dir: [number, number, number]; // unit, ground -> sun, Three space (from the sun core)
  contributes: boolean; // altitude clears the working threshold
  weightHours: number; // trapezoidal: stepMin/60 interior, half at the ends, 0 if not contributing
};

// An analysis region on the ENU ground plane. It reads as analysis (a luminous
// overlay), never as a measured Toronto feature, which is how the one line holds.
// v1 is an oriented rectangle; the polygon ring is kept open for a later increment.
export type AnalysisRegion = {
  id: string;
  name: string;
  kind: "rect" | "polygon";
  center: [number, number]; // ENU [east, north] metres
  halfExtents: [number, number]; // ENU metres, before rotation (rect)
  rotationRad: number; // about the up axis
  ring?: [number, number][]; // ENU ring (polygon kind)
  source: "placed" | "authored"; // authored = seeded from data/study-regions.json
};

// The accumulated field over a region, row-major, sun-hours per texel. The GPU rig
// fills hours; the pure readers below consume it.
export type RegionField = {
  width: number;
  height: number;
  hours: Float32Array; // length width * height
  maxPossibleHours: number; // window length in hours, for normalizing the heatmap
};

// The metric, computed pure from baseline (unedited city) versus current (with the
// active edit). Net-new shadow is the sunlight an edit removes from the region.
export type StudyResult = {
  meanSunHours: number; // current, area-weighted mean over the region
  baselineMeanSunHours: number;
  netNewShadowHours: number; // baseline mean minus current mean (positive = removed)
  newlyShadowedFraction: number; // sunlit in baseline, shadowed now
  sunlitFraction: number; // current, fraction of texels above the sunlit threshold
  windowHours: number; // (end - start) / 60, for context
  exceedsThreshold: boolean; // the net-new delta crosses the bylaw dial (shown as a line)
};

export const DEFAULT_STUDY_DATE = "2026-09-21"; // autumn equinox
export const STUDY_WINDOW_START_MIN = 558; // 9:18, Toronto shadow-study window start
export const STUDY_WINDOW_END_MIN = 1098; // 18:18, window end

// The study runs on both backends (it is not compute-dependent post); the fallback
// degrades by sample count and resolution, honestly lesser by decision (ADR-R01).
export function defaultStudyConfig(backend: "webgpu" | "webgl2"): StudyConfig {
  const fallback = backend === "webgl2";
  return {
    isoDate: DEFAULT_STUDY_DATE,
    windowStartMin: STUDY_WINDOW_START_MIN,
    windowEndMin: STUDY_WINDOW_END_MIN,
    stepMin: fallback ? 45 : 20,
    resolution: fallback ? 128 : 256,
  };
}
