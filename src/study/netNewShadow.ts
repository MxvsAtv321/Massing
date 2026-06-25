import type { RegionField, StudyResult } from "./studyTypes";
import { meanSunHours, sunlitFraction } from "./sunHours";

// A texel holding at least this many hours of sun reads as meaningfully sunlit, the
// boundary for the newly-shadowed count. Exploratory, tunable; not a legal figure.
export const SUNLIT_MIN_HOURS = 1;

// The metric: how much sunlight an edit removes from the region. Baseline is the
// unedited measured city, current is the city with the active edit applied; both
// fields come from the identical rig and samples, so the difference is the edit's
// doing. Net-new shadow is the drop in mean sun-hours, reported alongside the area
// that flipped from sunlit to shadowed. The bylaw threshold is shown as a line the
// delta crosses, never a pass/fail verdict (ADR-R16, the one line).
export function netNewShadow(
  baseline: RegionField,
  current: RegionField,
  thresholdHours: number,
  mask?: Uint8Array,
  sunlitMinHours: number = SUNLIT_MIN_HOURS
): StudyResult {
  if (baseline.hours.length !== current.hours.length) {
    throw new Error("study: baseline and current fields differ in size");
  }

  const baselineMean = meanSunHours(baseline, mask);
  const currentMean = meanSunHours(current, mask);
  const netNew = baselineMean - currentMean;

  let newlyShadowed = 0;
  let count = 0;
  for (let i = 0; i < current.hours.length; i++) {
    if (mask && mask[i] === 0) continue;
    count++;
    if (
      baseline.hours[i] >= sunlitMinHours &&
      current.hours[i] < sunlitMinHours
    ) {
      newlyShadowed++;
    }
  }

  return {
    meanSunHours: currentMean,
    baselineMeanSunHours: baselineMean,
    netNewShadowHours: netNew,
    newlyShadowedFraction: count === 0 ? 0 : newlyShadowed / count,
    sunlitFraction: sunlitFraction(current, sunlitMinHours, mask),
    windowHours: current.maxPossibleHours,
    exceedsThreshold: netNew > thresholdHours,
  };
}
