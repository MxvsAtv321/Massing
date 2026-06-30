import * as THREE from "three/webgpu";
import { pickBackend, detectWebGPU, type Backend } from "./pickBackend";

export type RendererHandle = {
  renderer: THREE.WebGPURenderer;
  backend: Backend;
};

// Async factory for the R3F <Canvas gl={...}> prop. Builds one WebGPURenderer
// and forces the WebGL2 backend when WebGPU is unavailable (ADR-R01: one
// renderer, two backends; the fallback is visibly lesser by decision, never a
// second post stack). R3F passes its canvas in `props`; we spread it through.
// ?backend=webgl2 (or webgpu) forces the path, so the fallback frame is reachable for the V2 visual gate
// on a WebGPU machine. No param keeps the automatic choice.
function backendOverride(): Backend | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("backend");
  return v === "webgl2" ? "webgl2" : v === "webgpu" ? "webgpu" : null;
}

export async function createRenderer(
  props: Record<string, unknown>
): Promise<THREE.WebGPURenderer> {
  const backend: Backend = backendOverride() ?? pickBackend(detectWebGPU());
  const renderer = new THREE.WebGPURenderer({
    ...props,
    antialias: true,
    forceWebGL: backend === "webgl2",
  } as ConstructorParameters<typeof THREE.WebGPURenderer>[0]);
  // AgX is the look-defining tone curve (ADR-R04). In 1a it runs on the default
  // render path; in 1b it moves into the node post output.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.35;
  await renderer.init();
  // Report the backend three actually initialized (it may auto-fall back even when
  // navigator.gpu exists). The on-screen badge reads the same source.
  const isWebGPU = Boolean(
    (renderer.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend
  );
  if (typeof console !== "undefined") {
    console.info(`[massing] render backend: ${isWebGPU ? "WebGPU" : "WebGL2 fallback"}`);
  }
  return renderer;
}
