import { lonLatToEnu } from "../coords/enu";
import type { CityModel, FootprintRing } from "../model/types";

// Landmark registry and resolution (V4, ADR-R29). A landmark is a real building in the catchment,
// identified by a point, that gets a detailed appearance mesh over its real massing. The massing (its
// canonical box) is untouched and keeps casting the shadow and feeding the scorers; only how it looks
// changes. Server-safe (no THREE): page.tsx resolves the registry to placements the client renders.

export type LandmarkSpec = {
  id: string;
  name: string;
  lonlat: [number, number];
  kind: string; // model selector, e.g. "tapered-spire"
};

export type LandmarkFile = { landmarks: LandmarkSpec[] };

export type LandmarkPlacement = {
  clusterId: string; // the real cluster this landmark stands on (its boxes become shadow-only)
  name: string;
  kind: string;
  centroid: [number, number]; // ENU [east, north] of the tallest member footprint
  height: number; // the cluster's representative height, metres (the model scales to this)
  radius: number; // footprint max radius from the centroid, metres
};

const MAX_RESOLVE_M = 80; // a landmark point must land on a building this close, else it is dropped

function pointInRing(px: number, py: number, ring: FootprintRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function minDistToRing(px: number, py: number, ring: FootprintRing): number {
  let best = Infinity;
  for (const p of ring) best = Math.min(best, Math.hypot(p[0] - px, p[1] - py));
  return best;
}

// Resolve each landmark point to the nearest real cluster (the one whose tallest footprint contains or
// is closest to it), and read its real centroid, height, and footprint radius off the model.
export function resolveLandmarks(specs: LandmarkSpec[], model: CityModel): LandmarkPlacement[] {
  const [lon0, lat0] = model.originLatLon;
  const byId = new Map(model.buildings.map((b) => [b.id, b]));
  const out: LandmarkPlacement[] = [];

  for (const spec of specs) {
    const [ex, ey] = lonLatToEnu(spec.lonlat[0], spec.lonlat[1], lon0, lat0);
    let bestId = "";
    let bestDist = Infinity;
    for (const c of Object.values(model.clusters)) {
      const b = byId.get(c.tallestMemberId);
      const ring = b?.footprint[0];
      if (!ring) continue;
      const d = pointInRing(ex, ey, ring) ? 0 : minDistToRing(ex, ey, ring);
      if (d < bestDist) {
        bestDist = d;
        bestId = c.clusterId;
      }
    }
    if (!bestId || bestDist > MAX_RESOLVE_M) continue;

    const c = model.clusters[bestId];
    const ring = byId.get(c.tallestMemberId)!.footprint[0]!;
    let se = 0, sn = 0;
    for (const p of ring) {
      se += p[0];
      sn += p[1];
    }
    const cx = se / ring.length, cy = sn / ring.length;
    let radius = 0;
    for (const p of ring) radius = Math.max(radius, Math.hypot(p[0] - cx, p[1] - cy));

    out.push({ clusterId: bestId, name: spec.name, kind: spec.kind, centroid: [cx, cy], height: c.representativeHeight_m, radius });
  }
  return out;
}
