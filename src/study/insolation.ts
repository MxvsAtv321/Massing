import type { AnalysisRegion, RegionField, SunHoursSample } from "./studyTypes";
import { regionTexelToEnu } from "./region";
import { sampleHeightAt, type Heightfield } from "./heightfield";

// The sun-access raymarch (Unit 8, increment 8.3): for each texel of the region and
// each contributing sun sample, march the sun ray across the heightfield and add the
// sample's hours if nothing occludes it. Pure and THREE-free so it unit-tests in
// node; it runs in a worker off the frame loop, so the study never touches the
// render budget. The result is a sun-hours field over the region, the substrate for
// the heatmap (8.4) and the net-new metric (8.5).

const OCCLUDE_EPS = 0.01; // metres, avoids self-occlusion noise at the ground

// March from an ENU ground point toward the sun. Occluded if any cell along the
// horizontal track rises above the ray's height there; lit once the ray clears the
// tallest building or leaves the grid. The sun direction is Three space (ground ->
// sun): x = east, y = up, z = -north.
export function sunVisibleAt(
  field: Heightfield,
  e: number,
  n: number,
  dir: [number, number, number]
): boolean {
  const de = dir[0];
  const up = dir[1];
  const dn = -dir[2]; // Three -Z is ENU north
  if (up <= 0) return false; // sun at or below the horizon

  const horiz = Math.hypot(de, dn);
  if (horiz < 1e-6) return true; // sun straight overhead, never occluded

  const ne = de / horiz;
  const nn = dn / horiz;
  const tanAlt = up / horiz;
  const step = field.cellSize;
  const maxDist = field.maxHeight / tanAlt; // beyond this the ray is above everything

  for (let dist = step; dist <= maxDist; dist += step) {
    const rayH = dist * tanAlt;
    if (rayH > field.maxHeight) return true;
    const h = sampleHeightAt(field, e + ne * dist, n + nn * dist);
    if (h > rayH + OCCLUDE_EPS) return false;
  }
  return true;
}

// Accumulate the sun-hours field over the region. Each texel center maps to an ENU
// ground point; contributing samples that reach it add their weighted hours.
export function computeInsolation(
  region: AnalysisRegion,
  resolution: number,
  field: Heightfield,
  samples: SunHoursSample[]
): RegionField {
  const res = Math.max(1, Math.floor(resolution));
  const hours = new Float32Array(res * res);

  let maxPossibleHours = 0;
  for (const s of samples) maxPossibleHours += s.weightHours;
  const active = samples.filter((s) => s.contributes && s.weightHours > 0);

  for (let j = 0; j < res; j++) {
    const v = (j + 0.5) / res;
    for (let i = 0; i < res; i++) {
      const u = (i + 0.5) / res;
      const [e, n] = regionTexelToEnu(region, u, v);
      let h = 0;
      for (const s of active) {
        if (sunVisibleAt(field, e, n, s.dir)) h += s.weightHours;
      }
      hours[j * res + i] = h;
    }
  }

  return { width: res, height: res, hours, maxPossibleHours };
}
