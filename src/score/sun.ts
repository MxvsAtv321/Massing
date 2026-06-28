import type { ExpandedDistrict } from "../generate/expand";
import type { SunScore } from "./types";
import {
  buildHeightfield,
  type HeightfieldBuilding,
  type HeightfieldSpec,
} from "../study/heightfield";
import { computeInsolation } from "../study/insolation";
import { computeShadowLedger, sunConfidence } from "../study/shadowLedger";
import { meanSunHours, sunlitFraction } from "../study/sunHours";
import { SUNLIT_MIN_HOURS } from "../study/netNewShadow";
import { massingToHeightfieldBuildings } from "../generate/heightfieldFromMassing";
import type { AnalysisRegion, SunHoursSample } from "../study/studyTypes";

// Sun-hours on a region (the park) given the district's massing plus the surrounding real city as
// occluders. Geometry-derived: it reads district.massing through the same study raymarch the renderer
// uses (ADR-R16), so the score and the on-screen heatmap describe the same city.
export function sunScore(
  district: ExpandedDistrict,
  region: AnalysisRegion,
  occluders: HeightfieldBuilding[],
  spec: HeightfieldSpec,
  samples: SunHoursSample[],
  resolution: number
): SunScore {
  const field = buildHeightfield(
    occluders.concat(massingToHeightfieldBuildings(district.massing)),
    spec
  );
  const result = computeInsolation(region, resolution, field, samples);
  const ledger = computeShadowLedger(region, resolution, field, samples);
  return {
    basis: "geometry",
    meanSunHours: meanSunHours(result),
    sunlitFraction: sunlitFraction(result, SUNLIT_MIN_HOURS),
    windowHours: result.maxPossibleHours,
    confidence: sunConfidence(ledger),
  };
}
