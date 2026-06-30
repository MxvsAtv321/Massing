"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { City } from "./City";
import { Landmarks } from "./LandmarkLayer";
import { Context } from "./Context";
import { Ground } from "./Ground";
import { Streets } from "./Streets";
import { Traffic } from "./Traffic";
import { Lighting } from "./Lighting";
import { SelectionHighlight } from "./SelectionHighlight";
import { HeightGizmo } from "./HeightGizmo";
import { StudyRegion } from "./StudyRegion";
import { StudyController } from "./StudyController";
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
import { useGenerativeLayer } from "./useGenerativeLayer";
import { GeneratedCity } from "./GeneratedCity";
import { GeneratedStreets } from "./GeneratedStreets";
import { studyState } from "./studyStore";
import { startAgent } from "./agentClient";
import { fillBlockDirective, districtDirective } from "../generate/directive";
import { nearestCentroid, nearestStreetBearingDeg } from "../generate/placement";
import type { GenerativeContext } from "../generate/types";
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

  // Generative proposal layer (G2): a hard-coded directive (key "g") fills a real block with a
  // 20-storey residential proposal, the cleared real buildings replaced by it, with the sun-access
  // study reflecting the new massing. No agent yet; this proves intent to grounded geometry to live
  // render to measured consequence (the first milestone).
  const gen = useGenerativeLayer();

  // Cluster centroids in ENU [east, north] for the canvas clearing (cityIndex maps to world
  // [x, z] = [east, -north], so flip z back).
  const clusterCentroidsEnu = useMemo(() => {
    const rec: Record<string, [number, number]> = {};
    for (const [cid, [x, z]] of clusterCentroids) rec[cid] = [x, -z];
    return rec;
  }, [clusterCentroids]);

  const roadCenterlines = useMemo(
    () => payload.streets.map((s) => s.path),
    [payload.streets]
  );
  // The waterfront anchor, derived from the model bounds the same way the server does (south edge),
  // so the agent's step-down gradient resolves identically and the signature matches.
  const waterEdge = useMemo<[number, number][]>(
    () => [
      [bounds.center[0] - bounds.radius, bounds.center[1] - bounds.radius],
      [bounds.center[0] + bounds.radius, bounds.center[1] - bounds.radius],
    ],
    [bounds.center, bounds.radius]
  );
  const genContext: GenerativeContext = useMemo(
    () => ({
      namedRegions: {},
      streets: {},
      districtBoundaries: {},
      clusterCentroids: clusterCentroidsEnu,
      realGraph: payload.realGraph,
      roadCenterlines,
      waterEdge,
    }),
    [clusterCentroidsEnu, roadCenterlines, payload.realGraph, waterEdge]
  );
  const genOpts = useMemo(
    () => ({ metresPerStorey: payload.metresPerStorey, snapRadiusM: 60, roadBufferM: 14 }),
    [payload.metresPerStorey]
  );

  // The real city with the proposal's cleared clusters dropped, so the generated block replaces the
  // buildings it stands on rather than overlapping them.
  const cityBuildings = useMemo(
    () =>
      gen.clearedClusterIds.size > 0
        ? payload.buildings.filter((b) => !gen.clearedClusterIds.has(b.clusterId))
        : payload.buildings,
    [payload.buildings, gen.clearedClusterIds]
  );

  // Split out the landmark clusters: they render as detailed models (Landmarks), so the structured City
  // mesh skips them while their shadow-casting boxes move into the Landmarks layer (V4).
  const landmarkClusterIds = useMemo(
    () => new Set(payload.landmarks.map((l) => l.clusterId)),
    [payload.landmarks]
  );
  const regularBuildings = useMemo(
    () => cityBuildings.filter((b) => !landmarkClusterIds.has(b.clusterId)),
    [cityBuildings, landmarkClusterIds]
  );
  const landmarkBuildings = useMemo(
    () => cityBuildings.filter((b) => landmarkClusterIds.has(b.clusterId)),
    [cityBuildings, landmarkClusterIds]
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

  // Generative directives: key "g" fills one real block, key "d" a multi-block district. Both land on
  // the real cluster nearest the center, orient the grid to the local street bearing, replace the real
  // buildings, and point the sun-access study at the result.
  const applyGenDirective = gen.applyDirective;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k !== "g" && k !== "d") return;
      const center = nearestCentroid(clusterCentroidsEnu, bounds.center) ?? bounds.center;
      const bearingDeg = nearestStreetBearingDeg(payload.streets, center) ?? 0;
      const rotationRad = (bearingDeg * Math.PI) / 180;
      const half = k === "d" ? 110 : 40;
      const region = {
        kind: "rect" as const,
        center,
        halfExtents: [half, half] as [number, number],
        rotationRad,
      };
      const ops =
        k === "d"
          ? districtDirective({ district: "d1", region, seed: 2, storeys: 22, bearingDeg })
          : fillBlockDirective({ district: "g1", region, seed: 1, storeys: 20, bearingDeg });
      applyGenDirective(ops, genContext, genOpts);
      const studyHalf = k === "d" ? 130 : 60;
      studyState.setRegion({
        id: "gen-study",
        name: "Generated block",
        kind: "rect",
        center,
        halfExtents: [studyHalf, studyHalf],
        rotationRad,
        source: "placed",
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bounds.center, clusterCentroidsEnu, payload.streets, applyGenDirective, genContext, genOpts]);

  // Key "a" runs the generative agent (G5): it builds a residential district to a population target,
  // streaming its ops here to render live, while the server scores. On finish the client signature is
  // compared to the server's (the determinism gate).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "a" || e.metaKey || e.ctrlKey) return;
      const center = nearestCentroid(clusterCentroidsEnu, bounds.center) ?? bounds.center;
      const bearingDeg = nearestStreetBearingDeg(payload.streets, center) ?? 0;
      const rotationRad = (bearingDeg * Math.PI) / 180;
      const region = {
        kind: "rect" as const,
        center,
        halfExtents: [200, 200] as [number, number],
        rotationRad,
      };
      studyState.setRegion({
        id: "agent-study",
        name: "Agent district",
        kind: "rect",
        center,
        halfExtents: [200, 200],
        rotationRad,
        source: "placed",
      });
      void startAgent({
        populationTarget: 40000,
        reachCeiling: 5,
        cityId: payload.cityId,
        placement: { region, seed: 7, bearingDeg },
        ctx: genContext,
        expandOpts: genOpts,
        onOps: (ops) => applyGenDirective(ops, genContext, genOpts),
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bounds.center, clusterCentroidsEnu, payload.streets, payload.cityId, applyGenDirective, genContext, genOpts]);

  // Seed the study region from the active city's default anchor (authored for Toronto, origin-centered
  // for an ingested city), so the overlay and the study land over the right city on load (I6).
  useEffect(() => {
    studyState.setRegion(payload.defaultStudyRegion);
  }, [payload.defaultStudyRegion]);

  return (
    <>
      {/* Warm distance haze blends the slice and the surrounding context into the
          horizon instead of ending at a hard ground edge. */}
      <fogExp2 attach="fog" args={["#241a14", 0.18 / Math.max(bounds.radius, 1)]} />
      <Lighting originLatLon={payload.originLatLon} ianaZone={payload.ianaZone} bounds={bounds} />
      <Ground radius={bounds.radius} />
      <Streets segments={payload.streets} flow={flowEngine} />
      {/* Living traffic: glowing capsules advected on the directed graph at the
          flow speed (CPU reference, 5b; GPU compute scales it in 5c). */}
      <Traffic network={payload.network} flow={flowEngine} />
      <City buildings={regularBuildings} metresPerStorey={payload.metresPerStorey} />
      <Landmarks buildings={landmarkBuildings} placements={payload.landmarks} />
      {/* The agent-authored proposal: cool-tinted generated streets and instanced massing that rises
          on a directive ("g" one block, "d" a district), the line held by register and the measured
          sun study, not by looking fake (G2/G3, ADR-R18/R19). */}
      <GeneratedStreets streets={gen.streets} />
      <GeneratedCity massing={gen.massing} />
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
      {/* Sun-access study region (8.2): a luminous, placeable analysis rectangle
          over the open space the study measures. Keys 1/2/3 move/resize/rotate. */}
      <StudyRegion />
      {/* Sun-access study runner (8.3): press "u" to compute the sun-hours field
          for the region off the main thread. Result logs to the console. */}
      <StudyController
        buildings={cityBuildings}
        generatedMassing={gen.massing}
        bounds={bounds}
        originLatLon={payload.originLatLon}
        ianaZone={payload.ianaZone}
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
