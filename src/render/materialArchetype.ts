import type { FootprintRing } from "../model/types";

// VISUAL-ONLY inference (ADR-R29). The material archetype is inferred from a building's real height and
// footprint area, a heuristic for how the building probably reads (a tall modern tower is usually glass),
// not a measurement of what it is. It produces only appearance and never feeds a consequence; the readonly
// geometry wall and the invariance gate guarantee it cannot. The geometry is measured, the material is
// inferred. This classifier must never grow to assert building use or age as if it were known.

export type Archetype = "glass" | "masonry" | "concrete" | "metal";

export function classifyArchetype(heightValue: number, footprintArea: number): Archetype {
  if (heightValue >= 70) return footprintArea < 900 ? "metal" : "glass"; // slender tall reads steel, broad tall glass
  if (heightValue >= 25) return footprintArea > 1500 ? "glass" : "masonry"; // mid: large floorplate commercial vs masonry
  return footprintArea > 1200 ? "concrete" : "masonry"; // low: large is concrete/retail, else masonry
}

export type Appearance = {
  roughness: number;
  metalness: number;
  color: readonly [number, number, number]; // linear RGB base albedo
};

const APPEARANCE: Record<Archetype, Appearance> = {
  glass: { roughness: 0.1, metalness: 0.65, color: [0.5, 0.58, 0.68] }, // low roughness reflects the sky/sun via IBL
  masonry: { roughness: 0.88, metalness: 0.0, color: [0.5, 0.41, 0.34] },
  concrete: { roughness: 0.8, metalness: 0.0, color: [0.56, 0.56, 0.57] },
  metal: { roughness: 0.35, metalness: 0.9, color: [0.6, 0.63, 0.67] },
};

export function archetypeAppearance(a: Archetype): Appearance {
  return APPEARANCE[a];
}

// Shoelace area of a footprint outer ring, ENU square metres.
export function footprintArea(ring: FootprintRing): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a) / 2;
}
