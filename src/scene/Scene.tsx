"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  buildMergedGeometry,
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
import type { ClusterIndexEntry } from "../model/types";

// ---------------------------------------------------------------------------
// Axis mapping (same as buildings.ts, must stay in sync with sun.ts):
//   ENU east  -> Three.js +X
//   ENU north -> Three.js -Z
//   ENU up    -> Three.js +Y
// ---------------------------------------------------------------------------

const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// SceneSetup: directional light + shadow map. Manual needsUpdate on sun move.
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
// Buildings: merged city geometry, rebuilt (via useMemo) when the list changes.
// Triggers shadowMap.needsUpdate after geometry changes so edits cast shadows.
// ---------------------------------------------------------------------------

function Buildings({ buildings }: { buildings: BuildingForScene[] }) {
  const { gl } = useThree();
  const geo = useMemo(() => buildMergedGeometry(buildings), [buildings]);

  useEffect(() => () => { geo?.dispose(); }, [geo]);
  useEffect(() => { gl.shadowMap.needsUpdate = true; }, [gl, geo]);

  if (!geo) return null;

  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial
        color="#c8bfb0"
        roughness={0.85}
        metalness={0.0}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// PickingProxy: one invisible AABB box per cluster.
// visible={true} keeps it in the R3F raycasting set.
// colorWrite={false} + depthWrite={false} means it paints nothing onscreen.
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
  const cz = -((aabb.minN + aabb.maxN) / 2); // ENU north -> Three.js -Z

  return (
    <mesh
      position={[cx, cy, cz]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onClusterClick(clusterId);
      }}
    >
      <boxGeometry args={[w, h, d]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        colorWrite={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Ground: flat plane at y=0. Captures pointer-down for ground clicks.
// event.point is in Three.js world space; ENU = [point.x, -point.z].
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
// CameraRig: frames the model on load.
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
// Scene: client root.
// ---------------------------------------------------------------------------

export type SceneProps = {
  buildings: BuildingForScene[];
  originLatLon: [number, number];
  clusters: Record<string, ClusterIndexEntry>;
  metresPerStorey: number;
};

export function Scene({ buildings, originLatLon, clusters, metresPerStorey }: SceneProps) {
  // Cluster representative heights for proportional scaling on Modify.
  const clusterRepHeights = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, entry] of Object.entries(clusters)) {
      m.set(id, entry.representativeHeight_m);
    }
    return m;
  }, [clusters]);

  // Edit state: overlay, log, undo.
  const editLayer = useEditLayer(buildings, clusterRepHeights, metresPerStorey);

  // Click and LLM interaction state.
  const interaction = useEditInteraction(clusters, metresPerStorey);

  // Apply: commit pending preview to the edit log, clear interaction state.
  const handleApply = useCallback(() => {
    const op = interaction.pendingPreview?.op;
    if (!op) return;
    editLayer.applyOp(op);
    interaction.cancelPreview();
    interaction.clearClick();
  }, [interaction, editLayer]);

  const bounds = useMemo(
    () => computeModelBounds(buildings),
    [buildings]
  );
  const sun = useSunDriver(originLatLon);

  // Per-cluster AABBs for picking proxies.
  const clusterAabbs = useMemo(
    () => computeClusterAabbs(buildings, clusterRepHeights),
    [buildings, clusterRepHeights]
  );

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ fov: 45, near: 1, far: bounds.radius * 8 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.4} color="#b0c4d8" />

        <SceneSetup
          bounds={bounds}
          sunDir={sun.sunDir}
          altitude={sun.altitude}
          isUsable={sun.isUsable}
        />

        {/* Real city buildings, with edits applied (Modify scales heights, Remove hides). */}
        <Buildings buildings={editLayer.realBuildings} />

        {/* Invisible per-cluster picking proxies. */}
        {Array.from(clusterAabbs.entries()).map(([clusterId, aabb]) => (
          <PickingProxy
            key={clusterId}
            clusterId={clusterId}
            aabb={aabb}
            onClusterClick={interaction.onClusterClick}
          />
        ))}

        {/* Preview ghost + applied hypothetical buildings. */}
        <HypotheticalBuildings
          pendingOp={interaction.pendingPreview?.op ?? null}
          appliedBuildings={editLayer.hypotheticalBuildings}
          originalBuildings={buildings}
          clusterRepHeights={clusterRepHeights}
          metresPerStorey={metresPerStorey}
        />

        {/* Ground plane — receives shadows and captures ground clicks. */}
        <Ground bounds={bounds} onGroundClick={interaction.onGroundClick} />

        <CameraRig bounds={bounds} />
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
    </div>
  );
}
