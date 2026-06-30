"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { buildBuildingGeometries } from "./cityGeometry";
import { archetypeAppearance } from "./materialArchetype";
import type { BuildingForScene } from "../mutation/building";
import type { LandmarkPlacement } from "./landmarks";

// Landmark rendering (V4, ADR-R29). A landmark's canonical boxes stay in the scene as shadow casters that
// write no color, so they cast exactly the real massing's shadow (the boxes-cast-shadows rule) while a
// detailed model stands in for them visually. The detailed model never casts a shadow; it is appearance
// over the real massing. The scorers and the heightfield read the same boxes from the payload, untouched.
export function Landmarks({
  buildings,
  placements,
}: {
  buildings: BuildingForScene[];
  placements: LandmarkPlacement[];
}) {
  const group = useMemo(() => {
    const root = new THREE.Group();
    if (buildings.length === 0) return root;

    // Shadow-only canonical boxes: cast the real massing's shadow, render no color and no depth occlusion
    // so the detailed model behind them shows through.
    const shadowMat = new THREE.MeshBasicNodeMaterial();
    shadowMat.colorWrite = false;
    shadowMat.depthWrite = false;
    const { geometries } = buildBuildingGeometries(buildings);
    for (const g of geometries) {
      const m = new THREE.Mesh(g, shadowMat);
      m.castShadow = true;
      m.receiveShadow = false;
      root.add(m);
    }

    // The detailed appearance models, never shadow casters.
    const glass = archetypeAppearance("glass");
    const modelMat = new THREE.MeshStandardNodeMaterial({
      roughness: glass.roughness,
      metalness: glass.metalness,
      side: THREE.DoubleSide,
    });
    modelMat.color = new THREE.Color(glass.color[0], glass.color[1], glass.color[2]);
    for (const p of placements) root.add(buildLandmarkModel(p, modelMat));

    return root;
  }, [buildings, placements]);

  return <primitive object={group} />;
}

// One World Trade Center: a square base that tapers into a square top rotated 45 degrees, the antiprism
// twist that gives it eight long triangular facets, plus a tall slender spire. Scaled to the real footprint
// radius and height and centered on the real footprint; stays within the canonical envelope so the box
// shadow always covers it.
function buildLandmarkModel(p: LandmarkPlacement, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const [cx, cy] = p.centroid;
  const h = p.height;
  const r = Math.max(p.radius * 0.7, 4);

  const shaftH = h * 0.82;
  const body = new THREE.Mesh(buildAntiprism(r, r * 0.4, shaftH), material);
  body.position.set(cx, 0, -cy); // world [x, z] = [east, -north]; the geometry carries its own y
  body.castShadow = false;
  body.receiveShadow = true;
  g.add(body);

  const spireH = h - shaftH;
  const spire = new THREE.CylinderGeometry(r * 0.02, r * 0.1, spireH, 6);
  const spireMesh = new THREE.Mesh(spire, material);
  spireMesh.position.set(cx, shaftH + spireH / 2, -cy);
  spireMesh.castShadow = false;
  g.add(spireMesh);

  return g;
}

// A tapered square antiprism: a square base in XZ at y=0, a square top rotated 45 degrees at y=h, joined by
// eight triangles. Normals are computed; the material renders both sides so winding never darkens a facet.
function buildAntiprism(rBase: number, rTop: number, h: number): THREE.BufferGeometry {
  const B = [
    [rBase, 0, rBase], [rBase, 0, -rBase], [-rBase, 0, -rBase], [-rBase, 0, rBase],
  ];
  const T = [
    [rTop, h, 0], [0, h, -rTop], [-rTop, h, 0], [0, h, rTop],
  ];
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  for (let i = 0; i < 4; i++) {
    const ni = (i + 1) % 4;
    tri(B[i], B[ni], T[i]); // up triangle on each base edge
    tri(B[ni], T[ni], T[i]); // down triangle to each top edge
  }
  tri(T[0], T[1], T[2]); // top cap
  tri(T[0], T[2], T[3]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}
