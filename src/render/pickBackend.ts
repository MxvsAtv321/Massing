export type Backend = "webgpu" | "webgl2";

// Pure backend selection so the choice is unit-testable without a GPU.
// WebGPU when the platform exposes it, otherwise the WebGL2 fallback (ADR-R01).
export function pickBackend(hasWebGPU: boolean): Backend {
  return hasWebGPU ? "webgpu" : "webgl2";
}

// Probe the running platform for WebGPU. Guarded for environments without a
// navigator (SSR, tests) even though the canvas is a client island.
export function detectWebGPU(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
  );
}
