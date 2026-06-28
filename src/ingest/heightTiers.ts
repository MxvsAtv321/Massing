// Tiered height resolution (I4, ADR-R26). A building's height comes from the best available source, in
// order of trust, and the tier is recorded as the height provenance (HEIGHT_SRC) so the confidence
// travels with the building all the way to the shadow ledger (I3a). The whole trust story rests here:
// the agent's evaluation is only as trustworthy as the heights, so where a height came from must never
// be lost. A building with no height in any tier is EXCLUDED, never defaulted (the spine).

export type HeightTier = "measured" | "osm-height" | "osm-levels";

export type RawHeightProps = {
  measuredHeight?: number | null; // city LiDAR-derived height (e.g. NYC heightroof), the best tier
  osmHeight?: number | null; // OSM height tag, metres
  osmLevels?: number | null; // OSM building:levels count
};

export type ResolvedHeight = { height: number; src: string; tier: HeightTier };

// Metres per storey when deriving a height from building:levels. The weakest tier: a level count times
// an assumed storey height is a guess, which is exactly why it carries the largest sigma in the manifest.
export const STOREY_M = 3.0;

// The HEIGHT_SRC string each tier writes. "Lidar-Derived" matches the Toronto manifest's measured key,
// so measured heights carry the same accuracy semantics across cities.
export const TIER_SRC: Record<HeightTier, string> = {
  measured: "Lidar-Derived",
  "osm-height": "OSM height",
  "osm-levels": "OSM building:levels",
};

export function resolveHeight(p: RawHeightProps): ResolvedHeight | null {
  if (p.measuredHeight != null && p.measuredHeight > 0) {
    return { height: p.measuredHeight, src: TIER_SRC.measured, tier: "measured" };
  }
  if (p.osmHeight != null && p.osmHeight > 0) {
    return { height: p.osmHeight, src: TIER_SRC["osm-height"], tier: "osm-height" };
  }
  if (p.osmLevels != null && p.osmLevels > 0) {
    return { height: p.osmLevels * STOREY_M, src: TIER_SRC["osm-levels"], tier: "osm-levels" };
  }
  return null; // no height in any tier: exclude, never default
}
