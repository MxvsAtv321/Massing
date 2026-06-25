import type { Lot } from "./lots";

// Mass a lot into a grounded building (ADR-R18, the box-plus-podium template, the single template for
// G1; slab and point-tower variety is the deferred upgrade). The footprint is the lot inset toward
// its centroid so the building covers `coverage` of the lot (area scales by the square of the inset,
// hence sqrt(coverage), computed once per lot, no per-vertex trig). Tall buildings gain a wider podium
// base. Pure; rectangular footprints keep the result instancing-friendly.

export type MassingPlacement = {
  id: string;
  lotId: string;
  template: "box" | "podium-tower";
  footprint: [number, number][]; // ENU ring, inset by coverage
  height: number; // metres
  storeys: number;
  podium?: { footprint: [number, number][]; height: number; storeys: number };
};

const PODIUM_STOREY_THRESHOLD = 12; // towers taller than this get a podium base
const PODIUM_STOREYS = 4;
const PODIUM_COVERAGE_BONUS = 0.3; // the podium is this much wider in coverage than the tower

export function massLot(
  lot: Lot,
  storeys: number,
  coverage: number,
  metresPerStorey: number
): MassingPlacement {
  const towerFootprint = insetRing(lot.ring, lot.centroid, Math.sqrt(coverage));
  const height = storeys * metresPerStorey;

  if (storeys > PODIUM_STOREY_THRESHOLD) {
    const podiumCoverage = Math.min(0.9, coverage + PODIUM_COVERAGE_BONUS);
    const podiumStoreys = Math.min(PODIUM_STOREYS, storeys);
    return {
      id: `${lot.id}/m`,
      lotId: lot.id,
      template: "podium-tower",
      footprint: towerFootprint,
      height,
      storeys,
      podium: {
        footprint: insetRing(lot.ring, lot.centroid, Math.sqrt(podiumCoverage)),
        height: podiumStoreys * metresPerStorey,
        storeys: podiumStoreys,
      },
    };
  }

  return {
    id: `${lot.id}/m`,
    lotId: lot.id,
    template: "box",
    footprint: towerFootprint,
    height,
    storeys,
  };
}

// Scale a ring toward a centroid by factor s (area scales by s^2). Multiply and add only.
function insetRing(
  ring: [number, number][],
  centroid: [number, number],
  s: number
): [number, number][] {
  return ring.map(([e, n]) => [
    centroid[0] + (e - centroid[0]) * s,
    centroid[1] + (n - centroid[1]) * s,
  ]);
}
