"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import type { BuildingForScene } from "../mutation/building";

// Rooftop clutter (VD3, ADR-R29): low parapets and mechanical penthouses above the measured roof, so the
// skyline stops being uniform flat tops. Strictly appearance, held to the same standard as the landmark
// mesh: it casts NO shadow and feeds NO consequence. The canonical box keeps casting the real shadow and
// the scorers read the measured height unchanged, so the invariance gate stays green through VD3 exactly as
// it did through V2 to V4. Bounded to low, modest detail (a few metres), so the one inconsistency this
// introduces, a rooftop that is visually taller than its own shadow, stays below what any eye catches at
// golden hour. The measured height is the roof; this is decoration above it the scorers never see and is
// never surfaced as a number.

// Deterministic per-building hash, so variation is stable across frames and reloads.
function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const MIN_HEIGHT_PARAPET = 8; // below this a building is a low shed; no roof detail
const MIN_HEIGHT_PENTHOUSE = 18; // mechanical penthouses only on taller buildings

function buildRoofClutterGeometry(buildings: BuildingForScene[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const quad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number
  ) => {
    const base = pos.length / 3;
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let k = 0; k < 4; k++) nor.push(nx, ny, nz);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (const b of buildings) {
    const ring = b.footprint[0];
    if (!ring || ring.length < 3) continue;
    const h = b.heightValue;
    if (h < MIN_HEIGHT_PARAPET) continue;

    // Centroid in world space [x, z] = [east, -north], used to orient parapet normals outward and to seat
    // the penthouse.
    let cx = 0, cz = 0;
    for (const p of ring) {
      cx += p[0];
      cz += -p[1];
    }
    cx /= ring.length;
    cz /= ring.length;

    const r1 = hash01(b.id);
    const r2 = hash01(b.id + "p");
    const r3 = hash01(b.id + "m");

    // Parapet: a thin raised lip along the footprint edge, low (0.8 to 2.4 m). Some buildings skip it, so
    // the rooflines vary rather than every roof gaining the same frame.
    if (r1 > 0.15) {
      const top = h + 0.8 + r1 * 1.6;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const c = ring[(i + 1) % ring.length];
        const ax = a[0], az = -a[1];
        const bx = c[0], bz = -c[1];
        const ex = bx - ax, ez = bz - az;
        // Outward horizontal normal: the edge perpendicular pointing away from the centroid.
        let nx = ez, nz = -ex;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if ((mx - cx) * nx + (mz - cz) * nz < 0) {
          nx = -nx;
          nz = -nz;
        }
        const len = Math.hypot(nx, nz) || 1;
        nx /= len;
        nz /= len;
        quad(ax, h, az, bx, h, bz, bx, top, bz, ax, top, az, nx, 0, nz);
      }
    }

    // Mechanical penthouse: a small box seated near the centroid, low (2 to 4 m), on taller buildings, and
    // only sometimes, so the cluster of towers reads varied.
    if (h > MIN_HEIGHT_PENTHOUSE && r2 > 0.45) {
      const s = 1.6 + r3 * 1.8; // half-extent 1.6 to 3.4 m
      const top = h + 2 + r2 * 2; // 2 to 4 m of clutter above the roof
      const x0 = cx - s, x1 = cx + s, z0 = cz - s, z1 = cz + s;
      quad(x1, h, z0, x1, h, z1, x1, top, z1, x1, top, z0, 1, 0, 0);
      quad(x0, h, z1, x0, h, z0, x0, top, z0, x0, top, z1, -1, 0, 0);
      quad(x1, h, z1, x0, h, z1, x0, top, z1, x1, top, z1, 0, 0, 1);
      quad(x0, h, z0, x1, h, z0, x1, top, z0, x0, top, z0, 0, 0, -1);
      quad(x0, top, z0, x1, top, z0, x1, top, z1, x0, top, z1, 0, 1, 0);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export function RoofClutter({ buildings }: { buildings: BuildingForScene[] }) {
  const mesh = useMemo(() => {
    const g = buildRoofClutterGeometry(buildings);
    const m = new THREE.MeshStandardNodeMaterial({
      roughness: 0.86,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    m.color = new THREE.Color(0.5, 0.49, 0.49); // neutral concrete-grey roof clutter
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = false; // VD3 constraint: clutter never casts a shadow; the box shadow stays canonical
    mesh.receiveShadow = true;
    return mesh;
  }, [buildings]);

  return <primitive object={mesh} />;
}
