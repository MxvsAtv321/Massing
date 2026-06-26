import type { ExpandedDistrict } from "../generate/expand";
import type { DistrictScores } from "./types";
import type { HeightfieldBuilding, HeightfieldSpec } from "../study/heightfield";
import type { AnalysisRegion, SunHoursSample } from "../study/studyTypes";
import { unitScore } from "./units";
import { sunScore } from "./sun";
import { reachScore } from "./reach";
import { trafficScore, type TrafficInputs } from "./traffic";

// The internal composer (G4): runs all four scores over the ONE ExpandedDistrict, so every score reads
// the same built geometry and stitched graph. This is what the fold-one test and the G6 full-vector
// loop hit. The agent in G5 does NOT call this; it gets the four scores as four separate tools
// (unitScore, sunScore, reachScore, trafficScore), so it pays for the expensive demand-conditional
// traffic re-solve only when it chooses to, and must reach for the conditional score consciously.

export type ScoreContext = {
  sun: {
    region: AnalysisRegion;
    occluders: HeightfieldBuilding[]; // the surrounding real city
    spec: HeightfieldSpec;
    samples: SunHoursSample[];
    resolution: number;
  };
  reach: { withinMinutes: number; walkSpeedMps?: number };
  traffic: TrafficInputs;
};

export function scoreDistrict(district: ExpandedDistrict, ctx: ScoreContext): DistrictScores {
  const units = unitScore(district);
  return {
    units,
    sun: sunScore(
      district,
      ctx.sun.region,
      ctx.sun.occluders,
      ctx.sun.spec,
      ctx.sun.samples,
      ctx.sun.resolution
    ),
    reach: reachScore(district, ctx.reach.withinMinutes, ctx.reach.walkSpeedMps),
    traffic: trafficScore(district, units.population, ctx.traffic),
  };
}
