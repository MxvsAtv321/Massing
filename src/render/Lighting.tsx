"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three/webgpu";
import { goldenHourSun } from "./sunInstant";
import { loadHdrEnvironment } from "./environment";
import type { ModelBounds } from "./types";

const HDRI_URL = "/env/venice_sunset_1k.hdr";

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
    let cancelled = false;
    void loadHdrEnvironment(gl, scene, HDRI_URL, {
      altitude: sun.altitude,
      azimuth: sun.azimuth,
    }).then((path) => {
      if (!cancelled && typeof console !== "undefined") {
        console.info(`[massing] IBL source: ${path}`);
      }
    });
    return () => {
      cancelled = true;
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
        intensity={4.2}
        color="#ffe3bd"
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
      {/* The HDRI carries ambient and fill now; keep a faint floor against pure black. */}
      <ambientLight intensity={0.05} />
    </>
  );
}
