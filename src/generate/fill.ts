import type { MassingPlacement } from "./massing";
import type { FillResult } from "./types";
import type { FillBlocksOp } from "./op";

// Compute achieved-versus-requested units for a fill (ADR-R20, the precedence: target is the goal,
// the envelope and coverage are hard constraints). achievedUnits is summed from the ACTUAL built
// massing, so when a height gradient pushes towers down near the water, the achieved count reflects
// that post-gradient reality rather than the pre-gradient envelope max, and the shortfall the agent
// reads matches the city that was actually built (the FillResult-versus-gradient carry). Pure.

export const AVG_HOUSEHOLD_SIZE = 2.1; // persons per dwelling
export const FLOOR_EFFICIENCY = 0.82; // net usable over gross floor area
// Gross floor area per unit. Office "units" are jobs, so the per-unit area is smaller.
export const UNIT_AREA_M2: Record<FillBlocksOp["program"], number> = {
  residential: 90,
  office: 25,
  mixed: 65,
};

export function ringArea(ring: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

// Gross floor area of one building. The podium carries its own lower floors; the tower carries the
// floors above the podium, so the two do not double-count.
export function floorArea(m: MassingPlacement): number {
  if (m.podium) {
    const towerFloors = Math.max(0, m.storeys - m.podium.storeys);
    return ringArea(m.podium.footprint) * m.podium.storeys + ringArea(m.footprint) * towerFloors;
  }
  return ringArea(m.footprint) * m.storeys;
}

export function requestedUnits(
  target: FillBlocksOp["target"],
  districtAreaM2: number
): number {
  if ("population" in target) return Math.round(target.population / AVG_HOUSEHOLD_SIZE);
  return Math.round(target.unitsPerHa * (districtAreaM2 / 10000));
}

export function computeFill(
  massing: MassingPlacement[],
  program: FillBlocksOp["program"],
  requested: number
): FillResult {
  const unitArea = UNIT_AREA_M2[program];
  let gross = 0;
  for (const m of massing) gross += floorArea(m);
  const achievedUnits = Math.floor((gross * FLOOR_EFFICIENCY) / unitArea);
  const shortfall = Math.max(0, requested - achievedUnits);
  return {
    requestedUnits: requested,
    achievedUnits,
    shortfall,
    metTarget: achievedUnits >= requested,
    buildingCount: massing.length,
  };
}
