import type { RegionField } from "./studyTypes";

// Pure readers over the accumulated sun-hours field. The GPU rig writes hours per
// texel; these reduce it to the numbers the study reports. An optional mask (1 =
// inside the region) restricts the reduction to the region's true footprint when
// the field's bounding rectangle overruns it.

// Area-weighted mean sun-hours. Every texel is equal area, so this is the plain
// mean over the included texels.
export function meanSunHours(field: RegionField, mask?: Uint8Array): number {
  const { hours } = field;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < hours.length; i++) {
    if (mask && mask[i] === 0) continue;
    sum += hours[i];
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

// Fraction of included texels that hold at least minHours of sun: the sunlit share
// of the region.
export function sunlitFraction(
  field: RegionField,
  minHours: number,
  mask?: Uint8Array
): number {
  const { hours } = field;
  let lit = 0;
  let count = 0;
  for (let i = 0; i < hours.length; i++) {
    if (mask && mask[i] === 0) continue;
    if (hours[i] >= minHours) lit++;
    count++;
  }
  return count === 0 ? 0 : lit / count;
}
