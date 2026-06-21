"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { createRenderer } from "./createRenderer";
import { pickBackend, detectWebGPU, type Backend } from "./pickBackend";
import { Scene } from "./Scene";
import { PerfStats } from "./PerfStats";
import type { CityPayload } from "./types";

const CLEAR_COLOR = "#0b0d10";

export default function Viewport({ payload }: { payload: CityPayload }) {
  const backend = useMemo<Backend>(() => pickBackend(detectWebGPU()), []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas
        shadows
        camera={{ position: [600, 450, 600], fov: 45, near: 1, far: 20000 }}
        gl={(props) => createRenderer(props as Record<string, unknown>)}
      >
        <color attach="background" args={[CLEAR_COLOR]} />
        <Scene payload={payload} />
        <PerfStats />
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
