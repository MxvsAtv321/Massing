"use client";

import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  buildMergedGeometry,
  buildSplitGeometries,
  computeModelBounds,
  computeClusterAabbs,
  type BuildingForScene,
  type ClusterAabb,
} from "./buildings";
import { useSunDriver } from "./useSunDriver";
import { SolarControls } from "./SolarControls";
import { MIN_SUN_ALTITUDE_DEG } from "../solar/sun";
import { useEditLayer } from "../mutation/editState";
import { useEditInteraction } from "./useEditInteraction";
import { EditControls } from "./EditControls";
import { HypotheticalBuildings } from "./HypotheticalBuildings";
import { RoadNetwork } from "./RoadNetwork";
import { NetworkReadout } from "./NetworkReadout";
import { DemandLayer } from "./DemandLayer";
import { DemandControls } from "./DemandControls";
import { FlowOverlay } from "./FlowOverlay";
import { FlowReadout } from "./FlowReadout";
import { useDemandScenario } from "../traffic/useDemandScenario";
import { useFlow } from "../traffic/useFlow";
import { BuildingInfoPanel } from "../honesty/BuildingInfoPanel";
import { DoNotMeasurePanel } from "../honesty/DoNotMeasurePanel";
import { ExportButton } from "../honesty/ExportButton";
import type { ClusterIndexEntry } from "../model/types";
import type { ClusterProvenanceEntry } from "../honesty/confidence";
import type { FooterSourcesSlice } from "../honesty/footer";
import type { RoadEdgeForScene, NetworkStats } from "./roadGeometry";
import type { Place } from "../traffic/demand";
import type { RoutableNode, RoutableEdge } from "../traffic/routableGraph";

const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// SceneSetup: directional light + shadow map.
// ---------------------------------------------------------------------------

type SetupProps = {
  bounds: ReturnType<typeof computeModelBounds>;
  sunDir: THREE.Vector3;
  altitude: number;
  isUsable: boolean;
};

function SceneSetup({ bounds, sunDir, altitude, isUsable }: SetupProps) {
  const { gl, scene } = useThree();
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
  }, [gl]);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;

    const { center, radius, maxHeight } = bounds;

    scene.add(light.target);
    light.shadow.mapSize.set(4096, 4096);
    light.shadow.bias = -0.001;
    light.shadow.normalBias = 0.05;

    if (!isUsable) {
      light.intensity = 0;
      return () => { scene.remove(light.target); };
    }

    light.intensity = 2.5;
    light.position.copy(center).addScaledVector(sunDir, radius * 2);
    light.target.position.copy(center);

    const clampedAlt = Math.max(altitude, MIN_SUN_ALTITUDE_DEG);
    const shadowLength = maxHeight / Math.tan(clampedAlt * DEG2RAD);
    const halfExtent = radius + shadowLength;

    const cam = light.shadow.camera as THREE.OrthographicCamera;
    cam.left = -halfExtent;
    cam.right = halfExtent;
    cam.top = halfExtent;
    cam.bottom = -halfExtent;
    cam.near = radius * 0.1;
    cam.far = radius * 2 + halfExtent * 2;
    cam.updateProjectionMatrix();

    gl.shadowMap.needsUpdate = true;

    return () => { scene.remove(light.target); };
  }, [gl, scene, bounds, sunDir, altitude, isUsable]);

  return (
    <directionalLight ref={lightRef} castShadow intensity={2.5} color="#fff8e7" />
  );
}

// ---------------------------------------------------------------------------
// Buildings: merged city geometry, with optional confidence-kind tint.
// ---------------------------------------------------------------------------

type BuildingsProps = {
  buildings: BuildingForScene[];
  tintByConfidence: boolean;
};

function Buildings({ buildings, tintByConfidence }: BuildingsProps) {
  const { gl } = useThree();

  const geo = useMemo(
    () => (tintByConfidence ? null : buildMergedGeometry(buildings)),
    [buildings, tintByConfidence]
  );
  const split = useMemo(
    () => (tintByConfidence ? buildSplitGeometries(buildings) : null),
    [buildings, tintByConfidence]
  );

  useEffect(() => () => { geo?.dispose(); }, [geo]);
  useEffect(() => () => {
    split?.measured?.dispose();
    split?.estimated?.dispose();
  }, [split]);

  useEffect(() => { gl.shadowMap.needsUpdate = true; }, [gl, geo, split]);

  if (tintByConfidence && split) {
    return (
      <>
        {split.measured && (
          <mesh geometry={split.measured} castShadow receiveShadow>
            <meshStandardMaterial color="#6aaa84" roughness={0.85} metalness={0.0} side={THREE.FrontSide} />
          </mesh>
        )}
        {split.estimated && (
          <mesh geometry={split.estimated} castShadow receiveShadow>
            <meshStandardMaterial color="#c88a3a" roughness={0.85} metalness={0.0} side={THREE.FrontSide} />
          </mesh>
        )}
      </>
    );
  }

  if (!geo) return null;
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#c8bfb0" roughness={0.85} metalness={0.0} side={THREE.FrontSide} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// PickingProxy: invisible AABB box per cluster for raycasting.
// ---------------------------------------------------------------------------

type ProxyProps = {
  clusterId: string;
  aabb: ClusterAabb;
  onClusterClick: (id: string) => void;
};

function PickingProxy({ clusterId, aabb, onClusterClick }: ProxyProps) {
  const w = Math.max(aabb.maxE - aabb.minE, 2);
  const d = Math.max(aabb.maxN - aabb.minN, 2);
  const h = Math.max(aabb.repHeight, 5);
  const cx = (aabb.minE + aabb.maxE) / 2;
  const cy = h / 2;
  const cz = -((aabb.minN + aabb.maxN) / 2);

  return (
    <mesh
      position={[cx, cy, cz]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onClusterClick(clusterId);
      }}
    >
      <boxGeometry args={[w, h, d]} />
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Ground: flat plane at y=0.
// ---------------------------------------------------------------------------

type GroundProps = {
  bounds: ReturnType<typeof computeModelBounds>;
  onGroundClick: (enu: [number, number]) => void;
};

function Ground({ bounds, onGroundClick }: GroundProps) {
  const { center, radius, maxHeight } = bounds;
  const groundHalf = radius + maxHeight / Math.tan(MIN_SUN_ALTITUDE_DEG * DEG2RAD);
  const size = groundHalf * 2;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center.x, 0, center.z]}
      receiveShadow
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onGroundClick([e.point.x, -e.point.z]);
      }}
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#4a5240" roughness={1} metalness={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// CameraRig.
// ---------------------------------------------------------------------------

function CameraRig({ bounds }: { bounds: ReturnType<typeof computeModelBounds> }) {
  const { camera } = useThree();

  useEffect(() => {
    const { center, radius } = bounds;
    camera.position.set(center.x, center.y + radius * 0.7, center.z + radius * 1.4);
    camera.lookAt(center);
  }, [camera, bounds]);

  return (
    <OrbitControls
      target={[bounds.center.x, bounds.center.y, bounds.center.z]}
      enableDamping
      dampingFactor={0.08}
      minDistance={50}
      maxDistance={bounds.radius * 5}
    />
  );
}

// ---------------------------------------------------------------------------
// CanvasCapture: grabs gl.domElement and shares it with the parent via a ref.
// ---------------------------------------------------------------------------

function CanvasCapture({ onCapture }: { onCapture: (el: HTMLCanvasElement) => void }) {
  const { gl } = useThree();
  useEffect(() => { onCapture(gl.domElement); }, [gl, onCapture]);
  return null;
}

// ---------------------------------------------------------------------------
// Scene: client root.
// ---------------------------------------------------------------------------

export type SceneProps = {
  buildings: BuildingForScene[];
  originLatLon: [number, number];
  clusters: Record<string, ClusterIndexEntry>;
  metresPerStorey: number;
  clusterProvenances: Record<string, ClusterProvenanceEntry>;
  sourcesFooter: FooterSourcesSlice;
  routableNodes: RoutableNode[];
  routableEdges: RoutableEdge[];
  networkStats: NetworkStats;
  gateways: Place[];
};

export function Scene({
  buildings,
  originLatLon,
  clusters,
  metresPerStorey,
  clusterProvenances,
  sourcesFooter,
  routableNodes,
  routableEdges,
  networkStats,
  gateways,
}: SceneProps) {
  const [tintByConfidence, setTintByConfidence] = useState(false);
  const [showRoads, setShowRoads] = useState(true);
  const [showDemand, setShowDemand] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const demand = useDemandScenario(gateways);

  // Grey road centerlines: one per physical street, deduped from the directed edges.
  const roadEdges = useMemo<RoadEdgeForScene[]>(() => {
    const seen = new Set<string>();
    const out: RoadEdgeForScene[] = [];
    for (const e of routableEdges) {
      const lo = e.from < e.to ? e.from : e.to;
      const hi = e.from < e.to ? e.to : e.from;
      const wayId = e.id.slice(0, e.id.indexOf(":"));
      const key = `${wayId}:${lo}-${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ polyline: e.geometry, roadClass: e.roadClass });
    }
    return out;
  }, [routableEdges]);

  const flow = useFlow(routableNodes, routableEdges, gateways, demand.flows, showFlow);

  // Ref to the WebGL canvas for PNG export.
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvas = useCallback((el: HTMLCanvasElement) => {
    glCanvasRef.current = el;
  }, []);

  const clusterRepHeights = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, entry] of Object.entries(clusters)) {
      m.set(id, entry.representativeHeight_m);
    }
    return m;
  }, [clusters]);

  const editLayer = useEditLayer(buildings, clusterRepHeights, metresPerStorey);
  const interaction = useEditInteraction(clusters, metresPerStorey);

  const handleApply = useCallback(() => {
    const op = interaction.pendingPreview?.op;
    if (!op) return;
    editLayer.applyOp(op);
    interaction.cancelPreview();
    interaction.clearClick();
  }, [interaction, editLayer]);

  const bounds = useMemo(() => computeModelBounds(buildings), [buildings]);
  const sun = useSunDriver(originLatLon);

  const clusterAabbs = useMemo(
    () => computeClusterAabbs(buildings, clusterRepHeights),
    [buildings, clusterRepHeights]
  );

  const selectedClusterId =
    interaction.clickState?.kind === "building"
      ? interaction.clickState.clusterId
      : null;
  const selectedHeightM =
    interaction.clickState?.kind === "building"
      ? interaction.clickState.heightM
      : null;

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ fov: 45, near: 1, far: bounds.radius * 8 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.4} color="#b0c4d8" />

        <SceneSetup
          bounds={bounds}
          sunDir={sun.sunDir}
          altitude={sun.altitude}
          isUsable={sun.isUsable}
        />

        <Buildings buildings={editLayer.realBuildings} tintByConfidence={tintByConfidence} />

        {Array.from(clusterAabbs.entries()).map(([clusterId, aabb]) => (
          <PickingProxy
            key={clusterId}
            clusterId={clusterId}
            aabb={aabb}
            onClusterClick={interaction.onClusterClick}
          />
        ))}

        <HypotheticalBuildings
          pendingOp={interaction.pendingPreview?.op ?? null}
          appliedBuildings={editLayer.hypotheticalBuildings}
          originalBuildings={buildings}
          clusterRepHeights={clusterRepHeights}
          metresPerStorey={metresPerStorey}
          onBuildingClick={interaction.onHypotheticalClick}
        />

        <Ground bounds={bounds} onGroundClick={interaction.onGroundClick} />

        <RoadNetwork edges={roadEdges} visible={showRoads} />

        <FlowOverlay edges={routableEdges} flow={flow} visible={showFlow} />

        <DemandLayer
          places={gateways}
          flows={demand.flows}
          visible={showDemand}
          pendingOrigin={demand.pendingOrigin}
          pendingDestination={demand.pendingDestination}
          onGatewayClick={demand.onGatewayClick}
        />

        <CameraRig bounds={bounds} />
        <CanvasCapture onCapture={captureCanvas} />
      </Canvas>

      <SolarControls sun={sun} />

      <EditControls
        clickState={interaction.clickState}
        pendingPreview={interaction.pendingPreview}
        isLoading={interaction.isLoading}
        error={interaction.error}
        canUndo={editLayer.canUndo}
        onSubmitText={interaction.submitText}
        onApply={handleApply}
        onCancel={interaction.cancelPreview}
        onUndo={editLayer.undo}
        onClearClick={interaction.clearClick}
      />

      {/* Top-right is shared: the building info panel and the demand editor are mutually
          exclusive, switched by the Demand toggle. */}
      {showDemand ? (
        <DemandControls
          places={gateways}
          flows={demand.flows}
          pendingOrigin={demand.pendingOrigin}
          pendingDestination={demand.pendingDestination}
          setOrigin={demand.setOrigin}
          setDestination={demand.setDestination}
          addPendingFlow={demand.addPendingFlow}
          removeFlow={demand.removeFlow}
          loadExample={demand.loadExample}
          clearFlows={demand.clearFlows}
        />
      ) : (
        <BuildingInfoPanel
          selectedClusterId={selectedClusterId}
          selectedHeightM={selectedHeightM}
          clusterProvenances={clusterProvenances}
          sun={sun}
        />
      )}

      <DoNotMeasurePanel />

      <NetworkReadout stats={networkStats} />

      {showFlow && flow && <FlowReadout flow={flow} />}

      {/* Bottom-right: data-quality toggle + legend + export */}
      <div style={styles.bottomRight}>
        {tintByConfidence && (
          <div style={styles.legend}>
            <span style={styles.legendItem}>
              <span style={{ ...styles.chip, background: "#6aaa84" }} /> Measured (LiDAR)
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.chip, background: "#c88a3a" }} /> Estimated (Site Plan)
            </span>
          </div>
        )}
        <div style={styles.controlRow}>
          <button
            onClick={() => setShowRoads((r) => !r)}
            style={{ ...styles.ctrlBtn, ...(showRoads ? styles.ctrlBtnActive : {}) }}
          >
            {showRoads ? "● Roads" : "○ Roads"}
          </button>
          <button
            onClick={() => setShowDemand((d) => !d)}
            style={{ ...styles.ctrlBtn, ...(showDemand ? styles.ctrlBtnActive : {}) }}
          >
            {showDemand ? "● Demand" : "○ Demand"}
          </button>
          <button
            onClick={() => setShowFlow((f) => !f)}
            style={{ ...styles.ctrlBtn, ...(showFlow ? styles.ctrlBtnActive : {}) }}
          >
            {showFlow ? "● Flow" : "○ Flow"}
          </button>
          <button
            onClick={() => setTintByConfidence((t) => !t)}
            style={{ ...styles.ctrlBtn, ...(tintByConfidence ? styles.ctrlBtnActive : {}) }}
          >
            {tintByConfidence ? "● Quality" : "○ Quality"}
          </button>
          <ExportButton
            canvasRef={glCanvasRef}
            sun={sun}
            sources={sourcesFooter}
            realBuildings={editLayer.realBuildings}
            hypotheticalBuildings={editLayer.hypotheticalBuildings}
          />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bottomRight: {
    position: "fixed",
    bottom: 24,
    right: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    zIndex: 10,
    userSelect: "none",
  },
  legend: {
    background: "rgba(10,10,12,0.80)",
    backdropFilter: "blur(8px)",
    borderRadius: 8,
    padding: "6px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontFamily: "system-ui, sans-serif",
    fontSize: 11,
    color: "#c8c0b8",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: 2,
    flexShrink: 0,
  },
  controlRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  ctrlBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 6,
    color: "#c8c0b8",
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
  ctrlBtnActive: {
    background: "rgba(106,170,132,0.20)",
    border: "1px solid rgba(106,170,132,0.45)",
    color: "#6aaa84",
  },
};
