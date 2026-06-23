"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { City } from "./City";
import { Context } from "./Context";
import { Ground } from "./Ground";
import { Streets } from "./Streets";
import { Lighting } from "./Lighting";
import { SelectionHighlight } from "./SelectionHighlight";
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
      {/* Warm distance haze blends the slice and the surrounding context into the
          horizon instead of ending at a hard ground edge. */}
      <fogExp2 attach="fog" args={["#241a14", 0.18 / Math.max(bounds.radius, 1)]} />
      <Lighting originLatLon={payload.originLatLon} bounds={bounds} />
      <Ground radius={bounds.radius} />
      <Streets segments={payload.streets} />
      <City buildings={payload.buildings} />
      {/* Warm additive glow over whichever cluster is picked (selectionStore). */}
      <SelectionHighlight buildings={payload.buildings} />
      {/* Invented backdrop fabric so the slice reads as part of a larger city;
          low, desaturated, and fog-bound, never measured Toronto. */}
      <Context
        center={bounds.center}
        innerRadius={bounds.radius * 1.2}
        outerRadius={bounds.radius * 3.5}
      />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        target={[cx, 0, cz]}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  );
}
