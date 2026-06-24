"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { City } from "./City";
import { Context } from "./Context";
import { Ground } from "./Ground";
import { Streets } from "./Streets";
import { Traffic } from "./Traffic";
import { Lighting } from "./Lighting";
import { SelectionHighlight } from "./SelectionHighlight";
import { HeightGizmo } from "./HeightGizmo";
import { computeModelBounds } from "./cityGeometry";
import {
  buildClusterRepHeights,
  buildClusterCentroids,
} from "./cityIndex";
import { committedRatio } from "./heightEdit";
import { editRatios } from "./editRatios";
import { editHud } from "./editHud";
import { createFlowEngine, type EditedCluster } from "./flowEngine";
import { useSelection } from "./selectionStore";
import { useEditLayer } from "../mutation/editState";
import type { CityPayload } from "./types";

// Composes the lit, grounded city and frames the camera on the neighborhood.
export function Scene({ payload }: { payload: CityPayload }) {
  const bounds = useMemo(
    () => computeModelBounds(payload.buildings),
    [payload.buildings]
  );
  const camera = useThree((s) => s.camera);

  const cx = bounds.center[0];
  const cz = -bounds.center[1]; // ENU north -> -Z

  // Edit layer: clusters drive height edits. clusterRepHeights and centroids are
  // derived once; the overlay is the logical, undoable source of truth, mirrored
  // into editRatios for the renderer's per-frame matrix path (ADR-R11).
  const clusterRepHeights = useMemo(
    () => buildClusterRepHeights(payload.clusters),
    [payload.clusters]
  );
  const clusterCentroids = useMemo(
    () => buildClusterCentroids(payload.buildings),
    [payload.buildings]
  );
  const validClusterIds = useMemo(
    () => new Set(Object.keys(payload.clusters)),
    [payload.clusters]
  );
  const editLayer = useEditLayer(
    payload.buildings,
    clusterRepHeights,
    payload.metresPerStorey
  );
  const { overlay, applyOp, undo } = editLayer;
  const { selectedClusterId } = useSelection();

  // Client flow re-solver (5e): re-runs the BPR flow on each committed edit with the
  // edited buildings' generated trips, then re-tints the roads and (5e-3) the agents.
  const flowEngine = useMemo(
    () =>
      createFlowEngine(
        payload.reactive,
        clusterRepHeights,
        payload.metresPerStorey
      ),
    [payload.reactive, clusterRepHeights, payload.metresPerStorey]
  );

  useEffect(() => {
    const r = bounds.radius;
    camera.position.set(cx + r * 1.2, r * 0.85, cz + r * 1.2);
    camera.near = Math.max(r * 0.01, 0.5);
    camera.far = r * 12;
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }, [bounds, camera, cx, cz]);

  // Mirror committed edits into the renderer's per-cluster ratio store, and re-solve
  // the flow with the same edits so the roads (and agents) react.
  useEffect(() => {
    const map = new Map<string, number>();
    const edited: EditedCluster[] = [];
    for (const [cid, newRep] of overlay.modifiedClusterHeights) {
      const ratio = committedRatio(newRep, clusterRepHeights.get(cid) ?? 0);
      map.set(cid, ratio);
      edited.push({ clusterId: cid, ratio });
    }
    editRatios.setCommitted(map);
    flowEngine.resolve(edited);
  }, [overlay, clusterRepHeights, flowEngine]);

  // Publish the selected building's storey count to the DOM readout. The gizmo
  // overrides this live during a drag; here it tracks selection and commits.
  useEffect(() => {
    if (!selectedClusterId) {
      editHud.setStoreys(null);
      return;
    }
    const repH = clusterRepHeights.get(selectedClusterId) ?? 0;
    const metres = overlay.modifiedClusterHeights.get(selectedClusterId) ?? repH;
    editHud.setStoreys(repH > 0 ? Math.round(metres / payload.metresPerStorey) : null);
  }, [selectedClusterId, overlay, clusterRepHeights, payload.metresPerStorey]);

  // Cmd/Ctrl+Z undoes the last edit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  return (
    <>
      {/* Warm distance haze blends the slice and the surrounding context into the
          horizon instead of ending at a hard ground edge. */}
      <fogExp2 attach="fog" args={["#241a14", 0.18 / Math.max(bounds.radius, 1)]} />
      <Lighting originLatLon={payload.originLatLon} bounds={bounds} />
      <Ground radius={bounds.radius} />
      <Streets segments={payload.streets} flow={flowEngine} />
      {/* Living traffic: glowing capsules advected on the directed graph at the
          flow speed (CPU reference, 5b; GPU compute scales it in 5c). */}
      <Traffic network={payload.network} flow={flowEngine} />
      <City buildings={payload.buildings} />
      {/* Warm additive glow over whichever cluster is picked (selectionStore). */}
      <SelectionHighlight buildings={payload.buildings} />
      {/* Y-scale gizmo on the selected building; commits a ModifyBuilding op. */}
      <HeightGizmo
        centroids={clusterCentroids}
        repHeights={clusterRepHeights}
        overlay={overlay}
        metresPerStorey={payload.metresPerStorey}
        validClusterIds={validClusterIds}
        applyOp={applyOp}
      />
      {/* Invented backdrop fabric so the slice reads as part of a larger city;
          low, desaturated, and fog-bound, never measured Toronto. */}
      <Context
        center={bounds.center}
        innerRadius={bounds.radius * 1.2}
        outerRadius={bounds.radius * 3.5}
      />
      {/* makeDefault so the height gizmo can suspend orbiting while dragging. */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[cx, 0, cz]}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  );
}
