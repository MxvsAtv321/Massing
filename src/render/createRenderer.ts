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
export async function createRenderer(
  props: Record<string, unknown>
): Promise<THREE.WebGPURenderer> {
  const backend: Backend = pickBackend(detectWebGPU());
  const renderer = new THREE.WebGPURenderer({
    ...props,
    antialias: true,
    forceWebGL: backend === "webgl2",
  } as ConstructorParameters<typeof THREE.WebGPURenderer>[0]);
  // AgX is the look-defining tone curve (ADR-R04). In 1a it runs on the default
  // render path; in 1b it moves into the node post output.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  await renderer.init();
  return renderer;
}
