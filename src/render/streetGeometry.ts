import * as THREE from "three";
import { congestionEmissive } from "./flowField";
import type { StreetSegment } from "./types";

const LANE_WIDTH_M = 3.6;
const Y_OFFSET = 0.08; // sit just above the ground plane to avoid z-fighting

// Minimum ribbon width per road class, so a 1-lane tag on an arterial still reads.
const MIN_WIDTH_BY_CLASS: Record<string, number> = {
  motorway: 14,
  trunk: 12,
  primary: 11,
  secondary: 9,
  tertiary: 8,
  residential: 6,
  living_street: 5,
  unclassified: 6,
};

export function streetWidth(lanes: number, roadClass: string): number {
  const byLanes = Math.max(1, lanes) * LANE_WIDTH_M;
  const floor = MIN_WIDTH_BY_CLASS[roadClass] ?? 6;
  return Math.max(byLanes, floor);
}

// Build one flat ribbon BufferGeometry for all street segments, lying on the
// ground at Y_OFFSET. Axis map (shared with the city): ENU east -> +X, north ->
// -Z, up -> +Y. Normals are forced up since the ribbons are horizontal.
export function buildStreetGeometry(segments: StreetSegment[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const congestion: number[] = []; // per-vertex emissive flow colour
  const indices: number[] = [];
  let base = 0;

  for (const seg of segments) {
    const pts = seg.path;
    if (pts.length < 2) continue;
    const half = streetWidth(seg.lanes, seg.roadClass) / 2;
    const [er, eg, eb] = congestionEmissive(seg.congestion);

    // ENU [east, north] -> XZ [east, -north]
    const xz = pts.map(([e, n]) => [e, -n] as [number, number]);

    for (let i = 0; i < xz.length; i++) {
      const prev = xz[Math.max(0, i - 1)];
      const next = xz[Math.min(xz.length - 1, i + 1)];
      let tx = next[0] - prev[0];
      let tz = next[1] - prev[1];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      // perpendicular in the XZ plane
      const px = -tz;
      const pz = tx;
      const [x, z] = xz[i];
      positions.push(x + px * half, Y_OFFSET, z + pz * half); // left
      positions.push(x - px * half, Y_OFFSET, z - pz * half); // right
      normals.push(0, 1, 0, 0, 1, 0);
      congestion.push(er, eg, eb, er, eg, eb); // same flow colour both edges
    }

    for (let i = 0; i < xz.length - 1; i++) {
      const a = base + i * 2; // left i
      const b = base + i * 2 + 1; // right i
      const c = base + (i + 1) * 2; // left i+1
      const d = base + (i + 1) * 2 + 1; // right i+1
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
    base += xz.length * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("congestion", new THREE.Float32BufferAttribute(congestion, 3));
  geo.setIndex(indices);
  return geo;
}

// Per-vertex congestion colours for a fresh flow solve, in the exact vertex order
// buildStreetGeometry emits (2 vertices per polyline point, segments with < 2 points
// skipped). Lets the live re-tint (5e) overwrite the attribute in place. perStreet is
// parallel to segments; a missing entry falls back to the segment's baked value.
export function congestionVertexArray(
  segments: StreetSegment[],
  perStreet: number[]
): Float32Array {
  const out: number[] = [];
  segments.forEach((seg, i) => {
    if (seg.path.length < 2) return;
    const [er, eg, eb] = congestionEmissive(perStreet[i] ?? seg.congestion);
    for (let v = 0; v < seg.path.length * 2; v++) out.push(er, eg, eb);
  });
  return new Float32Array(out);
}
