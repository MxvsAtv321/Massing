"use client";

import { useRef, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  buildMergedGeometry,
  computeModelBounds,
  type BuildingForScene,
} from "./buildings";
import { useSunDriver } from "./useSunDriver";
import { SolarControls } from "./SolarControls";
import { MIN_SUN_ALTITUDE_DEG } from "../solar/sun";

// ---------------------------------------------------------------------------
// Axis mapping (same as buildings.ts, must stay in sync with sun.ts):
//   ENU east  -> Three.js +X
//   ENU north -> Three.js -Z
//   ENU up    -> Three.js +Y
//
// Part 3 sun vector: sunDir points FROM ground TOWARD sun. At solar noon
// (az=180, sun due south), sunDir.z = +cos(alt) > 0 (south is +Z in Three.js).
// The shadow falls in the anti-sun direction, i.e. toward -Z = north. Correct.
//
// Light placement: center + sunDir * radius*2, so the shadow-casting rays travel
// from the sun's position back toward the scene center.
// ---------------------------------------------------------------------------

const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// SceneSetup: configures the directional light and shadow map.
// Runs useEffect on every sunDir change to update position and needsUpdate.
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

  // One-time: disable shadow auto-update. Part 3 drives needsUpdate manually.
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
  }, [gl]);

  // Re-run on every sun change to move the light and resize the frustum.
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
      // Leave needsUpdate false when sun is below threshold.
      return () => { scene.remove(light.target); };
    }

    light.intensity = 2.5;
    light.position.copy(center).addScaledVector(sunDir, radius * 2);
    light.target.position.copy(center);

    // Dynamic frustum: size to current altitude so noon is crisp, clamped at
    // the 8-degree worst case so the camera does not grow unboundedly.
    const clampedAlt = Math.max(altitude, MIN_SUN_ALTITUDE_DEG);
    const shadowLength = maxHeight / Math.tan(clampedAlt * DEG2RAD);
    const halfExtent = radius + shadowLength;

    const cam = light.shadow.camera as THREE.OrthographicCamera;
    cam.left = -halfExtent;
    cam.right = halfExtent;
    cam.top = halfExtent;
    cam.bottom = -halfExtent;
    // Light is at radius*2 from centre; scene extends halfExtent past centre.
    cam.near = radius * 0.1;
    cam.far = radius * 2 + halfExtent * 2;
    cam.updateProjectionMatrix();

    gl.shadowMap.needsUpdate = true;

    return () => { scene.remove(light.target); };
  }, [gl, scene, bounds, sunDir, altitude, isUsable]);

  return (
    <directionalLight
      ref={lightRef}
      castShadow
      intensity={2.5}
      color="#fff8e7"
    />
  );
}

// ---------------------------------------------------------------------------
// Buildings: merged city geometry, one draw call.
// ---------------------------------------------------------------------------

function Buildings({ buildings }: { buildings: BuildingForScene[] }) {
  const geoRef = useRef<THREE.BufferGeometry | null>(null);
  if (!geoRef.current) {
    geoRef.current = buildMergedGeometry(buildings);
  }
  const geo = geoRef.current;
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
// Ground: large flat plane at y=0, sized to catch low-sun long shadows.
// At 8 degrees, shadow length = maxHeight / tan(8deg) ~ 7x maxHeight.
// ---------------------------------------------------------------------------

function Ground({ bounds }: { bounds: ReturnType<typeof computeModelBounds> }) {
  const { center, radius, maxHeight } = bounds;
  // Extend ground to cover worst-case shadow length at MIN_SUN_ALTITUDE_DEG.
  const groundHalf = radius + maxHeight / Math.tan(MIN_SUN_ALTITUDE_DEG * DEG2RAD);
  const size = groundHalf * 2;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center.x, 0, center.z]}
      receiveShadow
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
    camera.position.set(
      center.x,
      center.y + radius * 0.7,
      center.z + radius * 1.4
    );
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
// Scene: client root. Receives slim building data + originLatLon from server.
// ---------------------------------------------------------------------------

export type SceneProps = {
  buildings: BuildingForScene[];
  originLatLon: [number, number];
};

export function Scene({ buildings, originLatLon }: SceneProps) {
  const bounds = computeModelBounds(buildings);
  const sun = useSunDriver(originLatLon);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{
          fov: 45,
          near: 1,
          far: bounds.radius * 8,
        }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.4} color="#b0c4d8" />

        <SceneSetup
          bounds={bounds}
          sunDir={sun.sunDir}
          altitude={sun.altitude}
          isUsable={sun.isUsable}
        />
        <Buildings buildings={buildings} />
        <Ground bounds={bounds} />
        <CameraRig bounds={bounds} />
      </Canvas>

      <SolarControls sun={sun} />
    </div>
  );
}
