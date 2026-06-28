import type { AnalysisRegion, SunHoursSample } from "./studyTypes";
import { regionTexelToEnu } from "./region";
import { CONF_MEASURED, CONF_GENERATED, type Heightfield } from "./heightfield";

// The shadow ledger (I3a, ADR-R26): re-march the sun across the region and attribute each lost
// sun-hour to the confidence of the occluder that actually blocked it. The confidence that rides with
// a region's sun number is then the confidence of the buildings that shadowed THIS region, not a city
// aggregate. Trusted occluders are measured heights and the proposal's own generated geometry;
// untrusted are estimated or hypothetical heights whose true height, and so whose shadow boundary, is
// uncertain. A region shadowed by guessed towers reads low confidence even on a mostly-measured city.
// A fully sunlit region reads high confidence regardless, because nothing uncertain is shadowing it.
// Pure and THREE-free, the same shape as computeInsolation, so it unit-tests in node.

const OCCLUDE_EPS = 0.01;

export type ShadowLedger = {
  lostTrusted: number; // region-mean sun-hours lost to measured or generated occluders
  lostUntrusted: number; // region-mean sun-hours lost to estimated or hypothetical occluders
  lostTotal: number;
};

export type SunConfidence = {
  shadowRiskFraction: number; // untrusted share of the lost sun, 0 when nothing is lost
  lostHours: number; // region-mean sun-hours lost to shadow
  class: "high" | "medium" | "low";
};

// March from an ENU ground point toward the sun; return 0 if the sun reaches it, else the confidence
// code of the cell that blocked it. Mirrors sunVisibleAt exactly, so the lit/shadowed verdict matches
// the insolation field; it just also reports the occluder.
export function sunOccluderClassAt(
  field: Heightfield,
  e: number,
  n: number,
  dir: [number, number, number]
): number {
  const de = dir[0];
  const up = dir[1];
  const dn = -dir[2]; // Three -Z is ENU north
  if (up <= 0) return 0;

  const horiz = Math.hypot(de, dn);
  if (horiz < 1e-6) return 0; // straight overhead, never occluded

  const ne = de / horiz;
  const nn = dn / horiz;
  const tanAlt = up / horiz;
  const step = field.cellSize;
  const maxDist = field.maxHeight / tanAlt;

  for (let dist = step; dist <= maxDist; dist += step) {
    const rayH = dist * tanAlt;
    if (rayH > field.maxHeight) return 0; // cleared everything, the sun reaches the point
    const pe = e + ne * dist;
    const pn = n + nn * dist;
    const ci = Math.floor((pe - field.originE) / field.cellSize);
    const cj = Math.floor((pn - field.originN) / field.cellSize);
    if (ci < 0 || cj < 0 || ci >= field.width || cj >= field.height) continue; // off-grid: open ground
    const idx = cj * field.width + ci;
    if (field.maxH[idx] > rayH + OCCLUDE_EPS) return field.conf[idx];
  }
  return 0;
}

// Accumulate the lost sun over the region, split by occluder trust.
export function computeShadowLedger(
  region: AnalysisRegion,
  resolution: number,
  field: Heightfield,
  samples: SunHoursSample[]
): ShadowLedger {
  const res = Math.max(1, Math.floor(resolution));
  const active = samples.filter((s) => s.contributes && s.weightHours > 0);

  let lostTrusted = 0;
  let lostUntrusted = 0;
  for (let j = 0; j < res; j++) {
    const v = (j + 0.5) / res;
    for (let i = 0; i < res; i++) {
      const u = (i + 0.5) / res;
      const [e, n] = regionTexelToEnu(region, u, v);
      for (const s of active) {
        const cls = sunOccluderClassAt(field, e, n, s.dir);
        if (cls === 0) continue; // the sun reaches this point, no loss
        if (cls === CONF_MEASURED || cls === CONF_GENERATED) lostTrusted += s.weightHours;
        else lostUntrusted += s.weightHours;
      }
    }
  }

  const texels = res * res;
  return {
    lostTrusted: lostTrusted / texels,
    lostUntrusted: lostUntrusted / texels,
    lostTotal: (lostTrusted + lostUntrusted) / texels,
  };
}

export function sunConfidence(ledger: ShadowLedger): SunConfidence {
  const frac = ledger.lostTotal > 0 ? ledger.lostUntrusted / ledger.lostTotal : 0;
  const cls = frac < 0.25 ? "high" : frac < 0.6 ? "medium" : "low";
  return { shadowRiskFraction: frac, lostHours: ledger.lostTotal, class: cls };
}
