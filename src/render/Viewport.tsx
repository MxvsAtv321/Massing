"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import { createRenderer } from "./createRenderer";
import { pickBackend, detectWebGPU, type Backend } from "./pickBackend";

// Graded clear: a deep, slightly cool studio background so the empty canvas
// reads as an intentional render surface, not a blank page. The art-directed
// mood presets arrive with the look system (Claude Design); this is the
// neutral baseline the WebGPU pipeline is stood up against in Unit 0.
const CLEAR_COLOR = "#0b0d10";

export default function Viewport() {
  const backend = useMemo<Backend>(() => pickBackend(detectWebGPU()), []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas
        camera={{ position: [60, 45, 60], fov: 45, near: 0.1, far: 5000 }}
        gl={(props) => createRenderer(props as Record<string, unknown>)}
      >
        <color attach="background" args={[CLEAR_COLOR]} />
        <OrbitControls enableDamping dampingFactor={0.08} />
      </Canvas>
      <BackendBadge backend={backend} />
    </div>
  );
}

// Dev-only readout of the active render path (ADR-R01). Folds into the real HUD
// when the editor UI lands.
function BackendBadge({ backend }: { backend: Backend }) {
  const label = backend === "webgpu" ? "WebGPU" : "WebGL2 fallback";
  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        font: "12px ui-monospace, SFMono-Regular, monospace",
        letterSpacing: "0.04em",
        color: "#8a9099",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {label}
    </div>
  );
}
