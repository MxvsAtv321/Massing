"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { uv, vec3, float, smoothstep, texture } from "three/tsl";
import { TransformControls } from "@react-three/drei";
import { studyState, useStudyState } from "./studyStore";
import { fieldToHeatmapData } from "../study/studyHeatmap";
import type { AnalysisRegion } from "../study/studyTypes";

// The analysis region for the sun-access study (Unit 8, increment 8.2): a luminous
// cyan rectangle laid on the ground over the open space the study measures. It
// reads unmistakably as analysis, not as a measured Toronto feature, which is how
// the one line holds (ADR-R16). The region is parented to a TransformControls proxy
// so it can be moved, resized, and rotated on device to sit over the real park;
// keys 1 / 2 / 3 switch move / resize / rotate. No accumulation here, just the
// object and its gizmo. The fill is additive and luminous so it serves the massing
// rather than masking it (spectacle stays restrained).

const OVERLAY_Y = 0.25; // metres above the ground plane, clear of z-fighting
const MIN_HALF = 5; // metres, smallest half-extent the resize allows
const BORDER_UV = 0.05; // luminous frame width as a fraction of the region
const FILL = 0.06; // faint interior wash
const BORDER_BRIGHT = 1.4; // edge glow above the fill (HDR, feeds bloom)
const COLOR: [number, number, number] = [0.35, 0.8, 1.05]; // cool analysis cyan

type Mode = "translate" | "scale" | "rotate";

export function StudyRegion() {
  const { region, field } = useStudyState();
  const proxy = useMemo(() => new THREE.Object3D(), []);
  const dragging = useRef(false);
  const [mode, setMode] = useState<Mode>("translate");

  // The sun-hours heatmap: bake the field into a DataTexture and sample it on a plane
  // under the border. Rebuilt only when a study finishes (not per frame), so the
  // recompile cost is paid once per run. The colours are graded CPU-side.
  const heat = useMemo(() => {
    if (!field) return null;
    const tex = new THREE.DataTexture(
      new Uint8Array(fieldToHeatmapData(field).buffer),
      field.width,
      field.height,
      THREE.RGBAFormat
    );
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const t = texture(tex);
    mat.colorNode = t.rgb;
    mat.opacityNode = t.a;
    return { tex, mat };
  }, [field]);

  useEffect(() => {
    return () => {
      heat?.tex.dispose();
      heat?.mat.dispose();
    };
  }, [heat]);

  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const u = uv();
    const dist = u.x.min(u.x.oneMinus()).min(u.y.min(u.y.oneMinus()));
    const border = smoothstep(float(0), float(BORDER_UV), dist).oneMinus();
    const intensity = border.mul(BORDER_BRIGHT).add(FILL);
    m.colorNode = vec3(COLOR[0], COLOR[1], COLOR[2]).mul(intensity);
    return m;
  }, []);

  // Sync the proxy from the region while not dragging (loading the default, a
  // committed move). ENU [east, north] -> Three [x, y, -z]; the rect's half-extents
  // map to the proxy scale on a unit (2 m) plane, rotation about the up axis.
  useEffect(() => {
    if (dragging.current) return;
    proxy.position.set(region.center[0], OVERLAY_Y, -region.center[1]);
    proxy.scale.set(region.halfExtents[0], 1, region.halfExtents[1]);
    proxy.rotation.set(0, -region.rotationRad, 0);
    proxy.updateMatrixWorld();
  }, [proxy, region]);

  // 1 move, 2 resize, 3 rotate. Mirrors a standard editor transform toolset.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") setMode("translate");
      else if (e.key === "2") setMode("scale");
      else if (e.key === "3") setMode("rotate");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the region flat and above a floor size during a drag (no React per move).
  const onObjectChange = () => {
    proxy.scale.set(
      Math.max(Math.abs(proxy.scale.x), MIN_HALF),
      1,
      Math.max(Math.abs(proxy.scale.z), MIN_HALF)
    );
    proxy.position.y = OVERLAY_Y;
  };

  // Commit the proxy back to the region on release: world -> ENU, scale -> extents,
  // up-axis rotation back to the ENU convention.
  const onMouseUp = () => {
    dragging.current = false;
    const next: AnalysisRegion = {
      ...region,
      kind: "rect",
      center: [round(proxy.position.x), round(-proxy.position.z)],
      halfExtents: [
        round(Math.max(Math.abs(proxy.scale.x), MIN_HALF)),
        round(Math.max(Math.abs(proxy.scale.z), MIN_HALF)),
      ],
      rotationRad: Number((-proxy.rotation.y).toFixed(4)),
      source: "placed",
    };
    studyState.setRegion(next);
    // Dev aid (8.2): read the placement off the console to bake the real park
    // footprint into data/study-regions.json once it sits right on device.
    console.log(
      "[study] region",
      JSON.stringify({
        center: next.center,
        halfExtents: next.halfExtents,
        rotationRad: next.rotationRad,
      })
    );
  };

  return (
    <>
      <primitive object={proxy}>
        {heat && (
          <mesh
            rotation-x={-Math.PI / 2}
            position-y={-0.02}
            material={heat.mat}
            renderOrder={997}
            raycast={() => {}}
          >
            <planeGeometry args={[2, 2]} />
          </mesh>
        )}
        <mesh
          rotation-x={-Math.PI / 2}
          material={material}
          renderOrder={998}
          raycast={() => {}}
        >
          <planeGeometry args={[2, 2]} />
        </mesh>
      </primitive>
      <TransformControls
        object={proxy}
        mode={mode}
        showX={mode !== "rotate"}
        showY={mode === "rotate"}
        showZ={mode !== "rotate"}
        onObjectChange={onObjectChange}
        onMouseDown={() => {
          dragging.current = true;
        }}
        onMouseUp={onMouseUp}
      />
    </>
  );
}

// Round metres to one decimal so the baked region coordinates stay legible.
function round(v: number): number {
  return Math.round(v * 10) / 10;
}
