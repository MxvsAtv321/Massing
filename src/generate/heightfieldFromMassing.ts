import type { MassingPlacement } from "./massing";
import type { HeightfieldBuilding } from "../study/heightfield";

// Feed generated massing into the sun-access study (ADR-R16): each building becomes a heightfield
// occluder so the raymarch sees the new district and the heatmap reflects it. The tower and its podium
// are both emitted, so the wider podium base casts its own short shadow. Pure; the study owns the
// raymarch, this only adapts the geometry.
export function massingToHeightfieldBuildings(
  massing: MassingPlacement[]
): HeightfieldBuilding[] {
  const out: HeightfieldBuilding[] = [];
  for (const m of massing) {
    out.push({ footprint: [m.footprint], height: m.height });
    if (m.podium) out.push({ footprint: [m.podium.footprint], height: m.podium.height });
  }
  return out;
}
