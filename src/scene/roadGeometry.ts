import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { RoadClass } from "../network/types";

// ---------------------------------------------------------------------------
// Slim road payload passed from the server to the scene: one centerline polyline per
// physical street (directed pairs already deduped), plus its class. Mirrors the slim
// BuildingForScene pattern; full provenance stays server-side.
//
// Axis mapping matches buildings.ts and sun.ts:
//   ENU east  -> Three.js +X
//   ENU north -> Three.js -Z
//   ENU up    -> Three.js +Y
// ---------------------------------------------------------------------------

export type RoadEdgeForScene = {
  polyline: [number, number][]; // ENU [east, north] metres
  roadClass: RoadClass;
};

// Live network facts for the honesty readout.
export type NetworkStats = {
  graphNodes: number;
  directedEdges: number;
  centerlineKm: number;
  strandedNodes: number;
  connected: boolean;
};

// Roads sit just above the y=0 ground plane so building shadows fall across them without
// z-fighting.
const ROAD_Y = 0.12;

// Half-widths in metres per class (drawn width is twice this). Arterials read a little
// wider than local streets; the differentiation is restrained on purpose.
const HALF_WIDTH: Record<RoadClass, number> = {
  motorway: 7,
  trunk: 6,
  primary: 5,
  secondary: 4.5,
  tertiary: 4,
  residential: 3,
  living_street: 2.5,
  unclassified: 3,
};

export type RoadTier = "arterial" | "local";

export function tierOf(rc: RoadClass): RoadTier {
  return rc === "residential" || rc === "living_street" || rc === "unclassified"
    ? "local"
    : "arterial";
}

// Build a flat ribbon along a polyline by offsetting each vertex along the averaged
// perpendicular of its adjacent segments, then stitching quads. Averaging at the vertex
// keeps the ribbon continuous through bends without gaps.
function ribbonGeometry(
  pts: [number, number][],
  halfWidth: number
): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;

  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // Left perpendicular of the travel direction.
    const nx = -dy;
    const ny = dx;
    const [x, y] = pts[i];
    left.push([x + nx * halfWidth, y + ny * halfWidth]);
    right.push([x - nx * halfWidth, y - ny * halfWidth]);
  }

  const positions: number[] = [];
  // ENU [east, north] -> Three [x=east, y=ROAD_Y, z=-north].
  const push = (p: [number, number]) => positions.push(p[0], ROAD_Y, -p[1]);

  for (let i = 0; i < pts.length - 1; i++) {
    push(left[i]);
    push(right[i]);
    push(right[i + 1]);
    push(left[i]);
    push(right[i + 1]);
    push(left[i + 1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// Build one merged ribbon geometry for a tier (one draw call), or null if empty.
export function buildRoadRibbons(
  edges: RoadEdgeForScene[],
  tier: RoadTier
): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const e of edges) {
    if (tierOf(e.roadClass) !== tier) continue;
    const g = ribbonGeometry(e.polyline, HALF_WIDTH[e.roadClass]);
    if (g) geos.push(g);
  }
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}
