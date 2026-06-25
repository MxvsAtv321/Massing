import type { AnalysisRegion } from "./studyTypes";

// Pure geometry for the analysis region: area, the texel-to-ENU mapping the GPU rig
// frames its ortho camera with, and the point-in-region test the metric masks with.
// All coordinates are ENU [east, north] metres, the same frame as the buildings.

export function regionArea(r: AnalysisRegion): number {
  if (r.kind === "polygon" && r.ring && r.ring.length >= 3) {
    return Math.abs(shoelace(r.ring));
  }
  return 4 * r.halfExtents[0] * r.halfExtents[1];
}

// Map normalized region coordinates (u, v in [0, 1]) to an ENU point. (0,0) is the
// region's local minus-east, minus-north corner; the rect is rotated about center.
export function regionTexelToEnu(
  r: AnalysisRegion,
  u: number,
  v: number
): [number, number] {
  const [hx, hy] = r.halfExtents;
  const localE = -hx + u * 2 * hx;
  const localN = -hy + v * 2 * hy;
  const cos = Math.cos(r.rotationRad);
  const sin = Math.sin(r.rotationRad);
  return [
    r.center[0] + localE * cos - localN * sin,
    r.center[1] + localE * sin + localN * cos,
  ];
}

// Whether an ENU point falls inside the region. The rect path inverse-rotates the
// point into local space and tests the half-extents; the polygon path is a ray cast.
export function enuInRegion(r: AnalysisRegion, e: number, n: number): boolean {
  if (r.kind === "polygon" && r.ring && r.ring.length >= 3) {
    return pointInRing(r.ring, e, n);
  }
  const dx = e - r.center[0];
  const dy = n - r.center[1];
  const cos = Math.cos(-r.rotationRad);
  const sin = Math.sin(-r.rotationRad);
  const localE = dx * cos - dy * sin;
  const localN = dx * sin + dy * cos;
  return (
    Math.abs(localE) <= r.halfExtents[0] && Math.abs(localN) <= r.halfExtents[1]
  );
}

// Parse and validate authored regions from data/study-regions.json. Authored
// regions are tagged as such; placement is tuned on device. Rejects malformed
// entries loudly rather than silently shipping a zero-area region.
export function parseRegions(raw: unknown): AnalysisRegion[] {
  const regions = (raw as { regions?: unknown }).regions;
  if (!Array.isArray(regions)) throw new Error("study-regions: missing regions[]");
  return regions.map((entry, i) => {
    const r = entry as Partial<AnalysisRegion>;
    if (typeof r.id !== "string" || typeof r.name !== "string") {
      throw new Error(`study-regions: entry ${i} missing id/name`);
    }
    const kind = r.kind === "polygon" ? "polygon" : "rect";
    const region: AnalysisRegion = {
      id: r.id,
      name: r.name,
      kind,
      center: tuple2(r.center, `entry ${i} center`),
      halfExtents: tuple2(r.halfExtents, `entry ${i} halfExtents`),
      rotationRad: typeof r.rotationRad === "number" ? r.rotationRad : 0,
      ring: r.ring,
      source: "authored",
    };
    if (regionArea(region) <= 0) {
      throw new Error(`study-regions: entry ${i} has zero area`);
    }
    return region;
  });
}

function tuple2(v: unknown, label: string): [number, number] {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    typeof v[0] !== "number" ||
    typeof v[1] !== "number"
  ) {
    throw new Error(`study-regions: ${label} must be [number, number]`);
  }
  return [v[0], v[1]];
}

function shoelace(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function pointInRing(ring: [number, number][], e: number, n: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > n !== yj > n && e < ((xj - xi) * (n - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
