"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three/webgpu";
import { useFrame } from "@react-three/fiber";
import { normalView, positionViewDirection, vec3 } from "three/tsl";
import { buildBuildingGeometries } from "./cityGeometry";
import { useSelection, selection } from "./selectionStore";
import { editRatios } from "./editRatios";
import type { BuildingForScene } from "../mutation/building";

// A warm Fresnel rim laid over the selected cluster's footprint geometry. A flat
// additive fill blows the silhouette to white and flattens the form; instead the
// glow rides the grazing edges (bright enough to feed bloom) with only a faint
// base tint on faces dead-on to the camera, so the building stays readable and
// still reads as unmistakably selected. The overlay is built from the same
// extruder the city uses, so it sits exactly on the real geometry.
const RIM_COLOR: [number, number, number] = [1.6, 0.95, 0.4]; // warm, HDR (> 1)
const RIM_POWER = 2.0; // higher = tighter rim
const BASE_TINT = 0.04; // faint fill so a head-on building still glows

export function SelectionHighlight({
  buildings,
}: {
  buildings: BuildingForScene[];
}) {
  const { selectedClusterId } = useSelection();

  // Esc clears the selection from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") selection.clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const group = useMemo(() => {
    if (!selectedClusterId) return null;
    const members = buildings.filter((b) => b.clusterId === selectedClusterId);
    const { geometries } = buildBuildingGeometries(members);
    if (geometries.length === 0) return null;

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      // Pull toward the camera in the depth buffer so the coincident overlay
      // does not z-fight with the building it sits on.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // facing = 1 head-on to the camera, 0 at the silhouette; invert and sharpen
    // so the warm color concentrates on the grazing edges, plus a faint base.
    const facing = normalView.dot(positionViewDirection).max(0);
    const rim = facing.oneMinus().pow(RIM_POWER).add(BASE_TINT);
    material.colorNode = vec3(RIM_COLOR[0], RIM_COLOR[1], RIM_COLOR[2]).mul(rim);

    const g = new THREE.Group();
    for (const geo of geometries) {
      const m = new THREE.Mesh(geo, material);
      m.renderOrder = 999;
      m.castShadow = false;
      m.receiveShadow = false;
      // The overlay must not steal the raycast from the building underneath, or
      // clicking a selected building would hit the glow (no cluster) and clear.
      m.raycast = () => {};
      g.add(m);
    }
    return g;
  }, [selectedClusterId, buildings]);

  // Free the per-selection geometries and the shared material on change/unmount.
  useEffect(() => {
    return () => {
      if (!group) return;
      const first = group.children[0] as THREE.Mesh | undefined;
      if (first) (first.material as THREE.Material).dispose();
      for (const child of group.children) {
        (child as THREE.Mesh).geometry.dispose();
      }
    };
  }, [group]);

  // Grow the glow with the building during a height edit. Scaling Y about the
  // group origin (y=0) keeps the base grounded, matching the city's instance
  // scaling, so the rim tracks the live drag and the committed height.
  useFrame(() => {
    if (group) group.scale.y = editRatios.ratioFor(selectedClusterId);
  });

  if (!group) return null;
  return <primitive object={group} />;
}
