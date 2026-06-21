"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { City } from "./City";
import { Ground } from "./Ground";
import { Lighting } from "./Lighting";
import { computeModelBounds } from "./cityGeometry";
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

  useEffect(() => {
    const r = bounds.radius;
    camera.position.set(cx + r * 1.2, r * 0.85, cz + r * 1.2);
    camera.near = Math.max(r * 0.01, 0.5);
    camera.far = r * 12;
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }, [bounds, camera, cx, cz]);

  return (
    <>
      <fogExp2 attach="fog" args={["#0c0e12", 0.35 / Math.max(bounds.radius, 1)]} />
      <Lighting originLatLon={payload.originLatLon} bounds={bounds} />
      <Ground radius={bounds.radius} />
      <City buildings={payload.buildings} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        target={[cx, 0, cz]}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  );
}
