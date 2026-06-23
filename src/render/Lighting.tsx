"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/addons/csm/CSMShadowNode.js";
import { sunAtMinutes } from "./sunInstant";
import { daylightFor, skyGradeFor } from "./daylight";
import { updateProceduralSky, type SkyHandle } from "./environment";
import { dayClock } from "./dayClockStore";
import type { ModelBounds } from "./types";

// The day runs on 2026-06-21 for now; a date picker is a later beat (Unit 3a).
const DATE = "2026-06-21";
const ENV_INTENSITY = 0.6;

// Regenerate the sky only when the sun has moved this far, and not more often
// than this, so PMREM never runs per frame.
const SKY_ALT_STEP = 0.6; // degrees of altitude
const SKY_AZ_STEP = 1.2; // degrees of azimuth
const SKY_MIN_MS = 90; // minimum gap between regenerations

// One sun, driven live by the day clock through the kept astronomy engine. Each
// frame the clock advances, the sun is recomputed, and the directional light and
// ambient are graded by altitude (daylight.ts). The procedural sky is regenerated
// on meaningful sun movement so dome and IBL track the sun. Cascaded shadows
// arrive in Unit 3b; here a single shadow camera is re-aimed down the sun.
export function Lighting({
  originLatLon,
  bounds,
}: {
  originLatLon: [number, number];
  bounds: ModelBounds;
}) {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;

  const lightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const csm = useRef<CSMShadowNode | null>(null);

  const sky = useRef<SkyHandle | null>(null);
  const lastSky = useRef({ alt: -999, az: -999, ms: -Infinity });

  const dist = Math.max(bounds.radius * 2.4, 400);
  const cx = bounds.center[0];
  const cz = -bounds.center[1]; // ENU north -> -Z

  // Keep the light's target in the scene graph so the shadow camera aims at the
  // city center, and tear down the sky resources on unmount.
  useEffect(() => {
    const light = lightRef.current;
    if (light) {
      light.target.position.set(cx, 0, cz);
      scene.add(light.target);
    }
    return () => {
      if (light) scene.remove(light.target);
      if (sky.current) {
        sky.current.rt.dispose();
        sky.current.sky.dispose();
        sky.current = null;
      }
      scene.environment = null;
      scene.background = null;
    };
  }, [scene, cx, cz]);

  // Cascaded shadow maps on the WebGPU path: low sun makes shadows very long, and
  // one shadow camera cannot hold near and far at resolution. CSMShadowNode splits
  // the view frustum into cascades. It is WebGPU-only, so the WebGL2 fallback keeps
  // the single shadow camera in the JSX below, visibly lesser by decision (ADR-R01).
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const isWebGPU = Boolean(
      (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
        ?.isWebGPUBackend
    );
    if (!isWebGPU) return;

    const node = new CSMShadowNode(light, {
      cascades: 4,
      maxFar: Math.max(bounds.radius * 3.5, 1500),
      mode: "practical",
      lightMargin: Math.max(bounds.radius * 1.5, 800),
    });
    node.fade = true;
    const shadow = light.shadow as unknown as { shadowNode: unknown };
    shadow.shadowNode = node;
    csm.current = node;

    return () => {
      node.dispose();
      shadow.shadowNode = null;
      csm.current = null;
    };
  }, [gl, bounds]);

  useFrame((_, delta) => {
    const minutes = dayClock.tick(delta);
    const sun = sunAtMinutes(originLatLon, DATE, minutes);
    const grade = daylightFor(sun.altitude);
    const skyGrade = skyGradeFor(sun.altitude);

    // Haze takes the hue of the sky horizon so the distance blend matches the
    // dome, but heavily darkened so it reads as depth, not a bright wall washing
    // the city out. Paired with a low fog density (Scene.tsx).
    const fog = scene.fog as { color?: { setRGB(r: number, g: number, b: number): void } } | null;
    if (fog?.color) {
      fog.color.setRGB(
        skyGrade.horizon[0] * 0.4,
        skyGrade.horizon[1] * 0.4,
        skyGrade.horizon[2] * 0.4
      );
    }

    const light = lightRef.current;
    if (light) {
      light.position.set(
        cx + sun.dir[0] * dist,
        sun.dir[1] * dist,
        cz + sun.dir[2] * dist
      );
      light.intensity = grade.intensity;
      light.color.setRGB(grade.color[0], grade.color[1], grade.color[2]);
      light.visible = grade.intensity > 0.001;
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = grade.ambient;
      ambientRef.current.color.setRGB(
        grade.ambientColor[0],
        grade.ambientColor[1],
        grade.ambientColor[2]
      );
    }

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const moved =
      Math.abs(sun.altitude - lastSky.current.alt) >= SKY_ALT_STEP ||
      Math.abs(sun.azimuth - lastSky.current.az) >= SKY_AZ_STEP;
    if (sky.current === null || (moved && now - lastSky.current.ms >= SKY_MIN_MS)) {
      sky.current = updateProceduralSky(gl, scene, sun, skyGrade, ENV_INTENSITY, sky.current);
      lastSky.current = { alt: sun.altitude, az: sun.azimuth, ms: now };
    }
  });

  return (
    <>
      <directionalLight
        ref={lightRef}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={dist * 3 + bounds.radius * 2}
        shadow-camera-left={-bounds.radius * 1.6}
        shadow-camera-right={bounds.radius * 1.6}
        shadow-camera-top={bounds.radius * 1.6}
        shadow-camera-bottom={-bounds.radius * 1.6}
        shadow-bias={-0.0004}
      />
      <ambientLight ref={ambientRef} intensity={0.05} />
    </>
  );
}
