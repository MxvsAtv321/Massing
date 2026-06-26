import type { ExpandedDistrict } from "../generate/expand";
import type { UnitScore } from "./types";
import { AVG_HOUSEHOLD_SIZE } from "../generate/fill";

// Units and population from the district's FillResult, the exact achieved count the expander already
// summed off the built massing (the one source of truth, G4). Pure, geometry-derived.
export function unitScore(district: ExpandedDistrict): UnitScore {
  let achievedUnits = 0;
  let requestedUnits = 0;
  let shortfall = 0;
  for (const f of district.fillResults) {
    achievedUnits += f.achievedUnits;
    requestedUnits += f.requestedUnits;
    shortfall += f.shortfall;
  }
  return {
    basis: "geometry",
    achievedUnits,
    requestedUnits,
    shortfall,
    population: Math.round(achievedUnits * AVG_HOUSEHOLD_SIZE),
  };
}
