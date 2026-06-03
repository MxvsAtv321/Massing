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

// ---------------------------------------------------------------------------
// Axis mapping (matches buildings.ts):
//   ENU east  -> Three.js +X
//   ENU north -> Three.js -Z
//   ENU up    -> Three.js +Y
//
// Sun direction convention (Part 3 will replace the hardcoded value below):
//   A unit vector pointing FROM the sun TOWARD the scene centre, expressed
//   in Three.js space. The DirectionalLight position is set to
//   sceneCentre - sunDir * (radius * 2), so the light travels along sunDir.
// ---------------------------------------------------------------------------

// Hardcoded sun: southwest sky, moderate elevation (~35 deg above horizon).
// azimuth ~225 deg (SW), elevation ~35 deg.
// In ENU: east = sin(225) = -0.707, north = cos(225) = -0.707, up = sin(35) ~ 0.574
// In Three.js (+X=east, +Y=up, -Z=north):
//   x = east  = -0.707
//   y = up     =  0.574
//   z = -north =  0.707  (south is +Z in Three.js, so north component flips)
// Normalised and pointing FROM origin TOWARD sun position (i.e. the direction light travels
// is the negation of this, but we use it as the offset for light.position).
// Part 3 replaces this with astronomy-engine output.
const SUN_DIR = new THREE.Vector3(-0.707, 0.574, 0.707).normalize();

// ---------------------------------------------------------------------------
// SceneSetup: accesses the renderer and wires shadow map settings.
// Lives inside the Canvas so it can call useThree.
// ---------------------------------------------------------------------------

function SceneSetup({ bounds }: { bounds: ReturnType<typeof computeModelBounds> }) {
  const { gl, scene } = useThree();
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;

    const { center, radius, maxHeight } = bounds;

    // Push the light far enough along SUN_DIR that its shadow camera
    // can see the entire scene. Position = centre + SUN_DIR * radius*2.
    // Target = scene centre. Both must be in the scene for the transform to apply.
    light.position.copy(center).addScaledVector(SUN_DIR, radius * 2);
    light.target.position.copy(center);
    scene.add(light.target);

    // Orthographic shadow camera frustum in the light's local space.
    // left/right/top/bottom encompass the horizontal scene extent.
    // near/far span the full depth of the scene along the light ray.
    const margin = 1.2;
    const cam = light.shadow.camera as THREE.OrthographicCamera;
    cam.left = -radius * margin;
    cam.right = radius * margin;
    cam.top = radius * margin;
    cam.bottom = -radius * margin;
    // near is small (light is radius*2 away, scene depth is ~radius*3 forward)
    cam.near = radius * 0.1;
    cam.far = radius * 4;
    cam.updateProjectionMatrix();

    light.shadow.mapSize.set(2048, 2048);
    // Bias values for PCFSoftShadowMap at city scale. Tune if acne or
    // peter-panning appears; Part 3's low-sun angles will need tighter values.
    light.shadow.bias = -0.001;
    light.shadow.normalBias = 0.05;

    // autoUpdate = false: shadow map only recomputes when needsUpdate is set.
    // Expose a function here (or set via ref from parent) so Part 3 can call it
    // after each sun-direction change instead of recomputing every frame.
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;

    return () => {
      scene.remove(light.target);
    };
  }, [gl, scene, bounds]);

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
// Buildings: renders the merged city geometry.
// ---------------------------------------------------------------------------

function Buildings({ buildings }: { buildings: BuildingForScene[] }) {
  const geoRef = useRef<THREE.BufferGeometry | null>(null);

  if (!geoRef.current) {
    geoRef.current = buildMergedGeometry(buildings);
  }

  const geo = geoRef.current;
  if (!geo) return null;

  return (
    <mesh
      geometry={geo}
      castShadow
      receiveShadow
    >
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
// Ground: flat plane at y = 0, receives shadows (ADR-002).
// ---------------------------------------------------------------------------

function Ground({ bounds }: { bounds: ReturnType<typeof computeModelBounds> }) {
  const size = bounds.radius * 3;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[bounds.center.x, 0, bounds.center.z]}
      receiveShadow
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#4a5240" roughness={1} metalness={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// CameraRig: positions camera and OrbitControls target to frame the model.
// ---------------------------------------------------------------------------

function CameraRig({ bounds }: { bounds: ReturnType<typeof computeModelBounds> }) {
  const { camera } = useThree();

  useEffect(() => {
    const { center, radius } = bounds;
    // Position camera above and to the south (positive Z in Three.js = south).
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
// Scene: exported client component. Receives slim building props from server.
// ---------------------------------------------------------------------------

export type SceneProps = {
  buildings: BuildingForScene[];
};

export function Scene({ buildings }: SceneProps) {
  const bounds = computeModelBounds(buildings);

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

        <SceneSetup bounds={bounds} />
        <Buildings buildings={buildings} />
        <Ground bounds={bounds} />
        <CameraRig bounds={bounds} />
      </Canvas>
    </div>
  );
}
