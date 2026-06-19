import type { RoadClass, RawWayTags } from "./types";

// ---------------------------------------------------------------------------
// OSM tag parsing. Pure, no I/O. Defaults are documented and applied only when
// the corresponding tag is missing; the build records where a default was used.
// ---------------------------------------------------------------------------

const ROAD_CLASSES: Record<string, RoadClass> = {
  motorway: "motorway",
  trunk: "trunk",
  primary: "primary",
  secondary: "secondary",
  tertiary: "tertiary",
  residential: "residential",
  living_street: "living_street",
  unclassified: "unclassified",
};

// Map an OSM highway value (including "_link" ramps) to a normalized RoadClass, or
// null if the value is not part of the drivable network.
export function parseRoadClass(highway: string): RoadClass | null {
  const base = highway.endsWith("_link") ? highway.slice(0, -"_link".length) : highway;
  return ROAD_CLASSES[base] ?? null;
}

// Directedness derived from the oneway tag (and roundabout/motorway defaults).
//   "forward" -> one directed edge along node order
//   "reverse" -> one directed edge against node order (oneway=-1)
//   "both"    -> two opposing directed edges
export type Direction = "forward" | "reverse" | "both";

export function parseOneway(tags: RawWayTags, roadClass: RoadClass): Direction {
  const v = (tags.oneway ?? "").trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "1") return "forward";
  if (v === "-1" || v === "reverse") return "reverse";
  if (v === "no" || v === "false" || v === "0") return "both";

  // Untagged: roundabouts and motorways are implicitly oneway in OSM.
  const junction = (tags.junction ?? "").trim().toLowerCase();
  if (junction === "roundabout" || junction === "circular") return "forward";
  if (roadClass === "motorway") return "forward";
  return "both";
}

// Default lane counts per class, used only when the lanes tag is absent.
const DEFAULT_LANES: Record<RoadClass, number> = {
  motorway: 3,
  trunk: 2,
  primary: 2,
  secondary: 2,
  tertiary: 1,
  residential: 1,
  living_street: 1,
  unclassified: 1,
};

// The lanes tag is the total across both directions for a two-way way; v1 reports the
// parsed value as-is (a per-direction split is a Part 3 concern).
export function parseLanes(
  tags: RawWayTags,
  roadClass: RoadClass
): { value: number; defaulted: boolean } {
  const raw = tags.lanes;
  if (raw != null) {
    // lanes is usually "2"/"3", occasionally "2;3"; take the first integer.
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return { value: n, defaulted: false };
  }
  return { value: DEFAULT_LANES[roadClass], defaulted: true };
}

// Default speed limits (kph) per class, Toronto urban values, used only when the
// maxspeed tag is absent.
const DEFAULT_SPEED_KPH: Record<RoadClass, number> = {
  motorway: 100,
  trunk: 80,
  primary: 60,
  secondary: 50,
  tertiary: 50,
  residential: 40,
  living_street: 20,
  unclassified: 40,
};

export function parseSpeedKph(
  tags: RawWayTags,
  roadClass: RoadClass
): { value: number; defaulted: boolean } {
  const raw = (tags.maxspeed ?? "").trim().toLowerCase();
  if (raw) {
    // Forms: "50", "50 km/h", "30 mph". Take the leading number; convert mph to kph.
    const m = raw.match(/^(\d+(?:\.\d+)?)/);
    if (m) {
      let v = parseFloat(m[1]);
      if (raw.includes("mph")) v = v * 1.609344;
      if (Number.isFinite(v) && v > 0) return { value: Math.round(v), defaulted: false };
    }
  }
  return { value: DEFAULT_SPEED_KPH[roadClass], defaulted: true };
}
