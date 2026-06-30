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
    });
    modelMat.color = new THREE.Color(glass.color[0], glass.color[1], glass.color[2]);
    for (const p of placements) root.add(buildLandmarkModel(p, modelMat));

    return root;
  }, [buildings, placements]);

  return <primitive object={group} />;
}

// A tapered shaft with a slender spire, scaled to the real footprint radius and height and centered on the
// real footprint. Reads as a distinctive tower (One World Trade Center) against the boxes around it, and
// stays within the canonical envelope so the box shadow always covers it.
function buildLandmarkModel(p: LandmarkPlacement, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const [cx, cy] = p.centroid;
  const h = p.height;
  const r = Math.max(p.radius * 0.78, 4);

  const shaftH = h * 0.88;
  const shaft = new THREE.CylinderGeometry(r * 0.45, r, shaftH, 4, 1); // 4-sided = square frustum
  shaft.rotateY(Math.PI / 4);
  const shaftMesh = new THREE.Mesh(shaft, material);
  shaftMesh.position.set(cx, shaftH / 2, -cy); // world [x, z] = [east, -north]
  shaftMesh.castShadow = false;
  shaftMesh.receiveShadow = true;
  g.add(shaftMesh);

  const spireH = h - shaftH;
  const spire = new THREE.CylinderGeometry(r * 0.03, r * 0.12, spireH, 8);
  const spireMesh = new THREE.Mesh(spire, material);
  spireMesh.position.set(cx, shaftH + spireH / 2, -cy);
  spireMesh.castShadow = false;
  g.add(spireMesh);

  return g;
}
