"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three/webgpu";
import { goldenHourSun } from "./sunInstant";
import { generateSkyEquirect, installEnvironment } from "./environment";
import type { ModelBounds } from "./types";

// One sun (from the kept astronomy-engine vector, fixed golden hour) plus the
// procedural HDR sky as IBL. Cascaded shadows are deferred to Unit 3 where low
// sun arrives; a single tuned shadow camera covers the fixed instant here.
export function Lighting({
  originLatLon,
  bounds,
}: {
  originLatLon: [number, number];
  bounds: ModelBounds;
}) {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;

  const sun = useMemo(() => goldenHourSun(originLatLon), [originLatLon]);

  useEffect(() => {
    const sky = generateSkyEquirect({ altitude: sun.altitude, azimuth: sun.azimuth });
    installEnvironment(gl, scene, sky);
    return () => {
      scene.environment = null;
    };
  }, [gl, scene, sun]);

  const dist = Math.max(bounds.radius * 2.4, 400);
  const [dx, dy, dz] = sun.dir;
  const cx = bounds.center[0];
  const cz = -bounds.center[1];

  return (
    <>
      <directionalLight
        position={[cx + dx * dist, dy * dist, cz + dz * dist]}
        intensity={3.4}
        color="#ffdcab"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={1}
        shadow-camera-far={dist * 3}
        shadow-camera-left={-bounds.radius * 1.6}
        shadow-camera-right={bounds.radius * 1.6}
        shadow-camera-top={bounds.radius * 1.6}
        shadow-camera-bottom={-bounds.radius * 1.6}
        shadow-bias={-0.0004}
      />
      <ambientLight intensity={0.12} />
    </>
  );
}
