"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { createRenderer } from "./createRenderer";
import { pickBackend, detectWebGPU, type Backend } from "./pickBackend";
import { Scene } from "./Scene";
import { RenderPipeline } from "./RenderPipeline";
import { TimeOfDayControl } from "./TimeOfDayControl";
import { SelectionPanel } from "./SelectionPanel";
import { StudyPanel } from "./StudyPanel";
import type { CityPayload } from "./types";

const CLEAR_COLOR = "#0b0d10";

export default function Viewport({ payload }: { payload: CityPayload }) {
  // Seed with the pre-check, then correct to the backend three actually used.
  const [backend, setBackend] = useState<Backend>(() => pickBackend(detectWebGPU()));

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas
        shadows
        camera={{ position: [600, 450, 600], fov: 45, near: 1, far: 20000 }}
        gl={(props) => createRenderer(props as Record<string, unknown>)}
      >
        <color attach="background" args={[CLEAR_COLOR]} />
        <Scene payload={payload} />
        <RenderPipeline />
        <BackendReporter onResolved={setBackend} />
      </Canvas>
      <BackendBadge backend={backend} />
      <TimeOfDayControl />
      <SelectionPanel />
      <StudyPanel />
    </div>
  );
}

// Reads the backend three actually initialized (truthful, unlike the JS pre-check
// which only knows whether navigator.gpu exists, not whether WebGPU init succeeded).
function BackendReporter({ onResolved }: { onResolved: (b: Backend) => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const isWebGPU = Boolean(
      (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend
    );
    onResolved(isWebGPU ? "webgpu" : "webgl2");
  }, [gl, onResolved]);
  return null;
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
        color: backend === "webgpu" ? "#7fd1a0" : "#d79a52",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {label}
    </div>
  );
}
