import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------------------
// Axis mapping (must match Part 3 sun-vector convention):
//   ENU east  -> Three.js +X
//   ENU north -> Three.js -Z  (north is "into" the scene; -Z is away from default camera)
//   ENU up    -> Three.js +Y
//
// How ExtrudeGeometry achieves this:
//   Shape is defined in the XY plane with (east, north) coordinates.
//   ExtrudeGeometry extrudes along +Z by building height.
//   rotateX(-PI/2) transforms the result:
//     old X (east)   -> new X (east)      +X  [unchanged]
//     old Y (north)  -> new -Z (south)    -Z  [north = -Z in Three.js]
//     old Z (height) -> new Y (up)        +Y  [height extrusion becomes Y]
// ---------------------------------------------------------------------------

// Slim type: only what the scene needs; provenance and coverage stay server-side.
export type BuildingForScene = {
  id: string;
  footprint: number[][][]; // rings of [east, north] ENU metres
  heightValue: number;
  clusterId: string;
};

// Signed area of a 2D ring (shoelace). Positive = CCW, negative = CW.
function signedArea(ring: number[][]): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return a * 0.5;
}

// Strip closing duplicate vertex if present.
function openRing(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const last = ring[ring.length - 1];
  const first = ring[0];
  if (last[0] === first[0] && last[1] === first[1]) return ring.slice(0, -1);
  return ring;
}

// Build a THREE.Shape from a footprint.
// outer ring: CCW (positive signed area).
// holes: CW (negative signed area).
// Three.js ExtrudeGeometry expects this convention in the shape XY plane.
function buildShape(rings: number[][][]): THREE.Shape {
  const outer = openRing(rings[0]);
  // Normalise outer ring to CCW.
  const outerNorm = signedArea(outer) >= 0 ? outer : [...outer].reverse();

  const shape = new THREE.Shape();
  shape.moveTo(outerNorm[0][0], outerNorm[0][1]);
  for (let i = 1; i < outerNorm.length; i++) {
    shape.lineTo(outerNorm[i][0], outerNorm[i][1]);
  }

  for (let h = 1; h < rings.length; h++) {
    const hole = openRing(rings[h]);
    // Normalise hole to CW (negative signed area).
    const holeNorm = signedArea(hole) <= 0 ? hole : [...hole].reverse();

    const path = new THREE.Path();
    path.moveTo(holeNorm[0][0], holeNorm[0][1]);
    for (let i = 1; i < holeNorm.length; i++) {
      path.lineTo(holeNorm[i][0], holeNorm[i][1]);
    }
    shape.holes.push(path);
  }

  return shape;
}

// Build a single merged BufferGeometry from all buildings.
// One merged mesh => one draw call; castShadow and receiveShadow are set on the mesh, not per-building.
export function buildMergedGeometry(
  buildings: BuildingForScene[]
): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];

  for (const b of buildings) {
    if (b.footprint.length === 0 || b.footprint[0].length < 4) continue;
    if (b.heightValue <= 0) continue;

    const shape = buildShape(b.footprint);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: b.heightValue,
      bevelEnabled: false,
    });

    // Apply axis mapping (see header comment).
    geo.rotateX(-Math.PI / 2);
    geos.push(geo);
  }

  if (geos.length === 0) return null;

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// Bounding box over all footprint vertices in Three.js space.
// Used by Scene.tsx to position the camera and size the shadow frustum.
// ---------------------------------------------------------------------------

export type ModelBounds = {
  center: THREE.Vector3;
  // Horizontal radius: max of half-extents in X and Z.
  radius: number;
  maxHeight: number;
};

export function computeModelBounds(buildings: BuildingForScene[]): ModelBounds {
  let minX = Infinity,
    maxX = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  let maxH = 0;

  for (const b of buildings) {
    for (const ring of b.footprint) {
      for (const pt of ring) {
        const x = pt[0];
        const z = -pt[1]; // north -> -Z
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
    if (b.heightValue > maxH) maxH = b.heightValue;
  }

  if (!isFinite(minX)) {
    return { center: new THREE.Vector3(), radius: 500, maxHeight: 50 };
  }

  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const cy = maxH / 2;
  const rx = (maxX - minX) / 2;
  const rz = (maxZ - minZ) / 2;

  return {
    center: new THREE.Vector3(cx, cy, cz),
    radius: Math.max(rx, rz),
    maxHeight: maxH,
  };
}
