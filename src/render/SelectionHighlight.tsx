"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three/webgpu";
import { buildBuildingGeometries } from "./cityGeometry";
import { useSelection, selection } from "./selectionStore";
import type { BuildingForScene } from "../mutation/building";

// A warm, HDR additive glow laid over the selected cluster's footprint geometry.
// Unlit and additive so the building's own shading still reads through it, and
// bright enough (> 1) that the bloom pass catches the silhouette: selecting a
// building makes it glow rather than wear a wireframe box. The overlay is built
// from the same extruder the city uses, so it sits exactly on the real geometry.
const GLOW = new THREE.Color(1.8, 1.0, 0.35);

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
      color: GLOW,
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

  if (!group) return null;
  return <primitive object={group} />;
}
