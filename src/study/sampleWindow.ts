import type { StudyConfig, SunHoursSample } from "./studyTypes";

// Below this apparent altitude shadow lengths are unreliable (h / tan(alt) blows
// up), so the sample contributes no sunlight. Mirrors MIN_SUN_ALTITUDE_DEG in
// src/solar/sun.ts; duplicated here to keep src/study THREE-free (sun.ts imports
// three for its Vector3 return).
export const STUDY_MIN_SUN_ALTITUDE_DEG = 8;

// The sun for an instant, as plain numbers. The study injects this rather than
// importing the solar core, so the module stays decoupled and pure; the render
// shell and tests wire in sunAtMinutes.
export type SunProvider = (
  isoDate: string,
  minutesOfDay: number
) => { altitude: number; azimuth: number; dir: [number, number, number] };

// The discrete time samples across the bylaw window, inclusive of both ends. With
// the default 9:18-18:18 window the step divides evenly (28 samples at 20 min, 13
// at 45 min); a non-even window still includes the end as a final sample.
export function buildSampleTimes(cfg: StudyConfig): number[] {
  const { windowStartMin: start, windowEndMin: end, stepMin: step } = cfg;
  if (step <= 0) throw new Error("study: stepMin must be positive");
  if (end < start) throw new Error("study: window end before start");
  if (end === start) return [start];

  const times: number[] = [];
  for (let t = start; t <= end; t += step) times.push(t);
  if (times[times.length - 1] !== end) times.push(end);
  return times;
}

// Enrich each sample time with the real sun and the sunlight weight it carries.
// A sample below the working altitude is in shadow for the study's purposes. The
// weight is trapezoidal: interior samples carry a full step, the two window ends a
// half step, so a fully-sunlit texel sums to exactly the window length rather than
// overcounting by one step from the inclusive endpoints.
export function buildSamples(cfg: StudyConfig, sun: SunProvider): SunHoursSample[] {
  const times = buildSampleTimes(cfg);
  const last = times.length - 1;
  const interior = cfg.stepMin / 60;
  return times.map((minutesOfDay, i) => {
    const s = sun(cfg.isoDate, minutesOfDay);
    const contributes = s.altitude >= STUDY_MIN_SUN_ALTITUDE_DEG;
    const isEnd = times.length > 1 && (i === 0 || i === last);
    const weight = isEnd ? interior / 2 : interior;
    return {
      minutesOfDay,
      altitudeDeg: s.altitude,
      azimuthDeg: s.azimuth,
      dir: s.dir,
      contributes,
      weightHours: contributes ? weight : 0,
    };
  });
}

// The total daylight hours the samples can sum to (only contributing samples),
// the ceiling for a fully-sunlit texel and the heatmap normalizer.
export function maxPossibleHours(samples: SunHoursSample[]): number {
  return samples.reduce((h, s) => h + s.weightHours, 0);
}
