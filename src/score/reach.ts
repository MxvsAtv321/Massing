import type { ExpandedDistrict } from "../generate/expand";
import type { ReachScore } from "./types";
import { reachConfidence } from "./confidence";
import { reachability, parkAccessNodes } from "../reach/reachability";

// The reachability tool: "is the park reachable in N minutes for the district's homes". Geometry-
// derived, but gated hard (scripts/verify-reachability) because a mis-stitched graph yields a
// confident, plausible, wrong isochrone. Sources are the park access nodes (the open-space block
// corners); homes are the residential lots.
export function reachScore(
  district: ExpandedDistrict,
  withinMinutes: number,
  walkSpeedMps?: number,
  coverage: "full" | "partial" = "full" // the real network's catchment coverage (ADR-R25), full on Toronto
): ReachScore {
  const r = reachability(district, parkAccessNodes(district), withinMinutes, walkSpeedMps);
  return {
    basis: "geometry",
    reachedFraction: r.reachedFraction,
    worstCaseMinutes: r.worstCaseMinutes,
    unreachableCount: r.unreachableCount,
    withinMinutes: r.withinMinutes,
    confidence: reachConfidence(r.reachedFraction, coverage),
  };
}
