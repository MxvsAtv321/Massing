import * as THREE from "three";
import type { BuildingForScene } from "../mutation/building";
import type { Footprint } from "../model/types";
import type { ModelBounds } from "./types";

// Build one extruded BufferGeometry per building, world-placed in Three space.
// Axis map (matches src/solar/sun.ts): ENU east -> +X, north -> -Z, up -> +Y.
// Footprint rings are [east, north] metres; ring 0 is the outer, the rest holes.
// Geometries are returned indexed so they drop straight into a BatchedMesh.
export function buildBuildingGeometries(buildings: BuildingForScene[]): {
  geometries: THREE.BufferGeometry[];
  ids: string[];
} {
  const geometries: THREE.BufferGeometry[] = [];
  const ids: string[] = [];

  for (const b of buildings) {
    if (b.heightValue <= 0) continue;
    const shape = buildShape(b.footprint);
    if (!shape) continue;

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: b.heightValue,
      bevelEnabled: false,
    });
    // Shape lives in XY (east, north) and extrudes along +Z. Rotate so north -> -Z
    // and the extrude direction -> +Y (up). See sun.ts for the shared axis map.
    geo.rotateX(-Math.PI / 2);

    if (!geo.getIndex()) {
      const n = geo.getAttribute("position").count;
      geo.setIndex(Array.from({ length: n }, (_, i) => i));
    }

    geometries.push(geo);
    ids.push(b.id);
  }

  return { geometries, ids };
}

function buildShape(footprint: Footprint): THREE.Shape | null {
  const outer = footprint[0];
  if (!outer || outer.length < 4) return null; // need 3 distinct points plus the close

  const shape = new THREE.Shape();
  outer.forEach(([e, n], i) => (i === 0 ? shape.moveTo(e, n) : shape.lineTo(e, n)));

  for (let h = 1; h < footprint.length; h++) {
    const ring = footprint[h];
    if (!ring || ring.length < 4) continue;
    const path = new THREE.Path();
    ring.forEach(([e, n], i) => (i === 0 ? path.moveTo(e, n) : path.lineTo(e, n)));
    shape.holes.push(path);
  }

  return shape;
}

// Axis-aligned bounds of all footprints, for camera framing and ground sizing.
export function computeModelBounds(buildings: BuildingForScene[]): ModelBounds {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;

  for (const b of buildings) {
    for (const ring of b.footprint) {
      for (const [e, n] of ring) {
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        if (n < minN) minN = n;
        if (n > maxN) maxN = n;
      }
    }
  }

  if (!isFinite(minE)) return { center: [0, 0], radius: 100 };

  const center: [number, number] = [(minE + maxE) / 2, (minN + maxN) / 2];
  const radius = Math.max(maxE - minE, maxN - minN) / 2 || 100;
  return { center, radius };
}
