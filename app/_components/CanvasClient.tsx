"use client";

import dynamic from "next/dynamic";
import type { CityPayload } from "../../src/render/types";

// The WebGPU canvas is a pure client island (ADR-R02): three/webgpu touches
// browser globals at import time, so it must never render on the server.
const Viewport = dynamic(() => import("../../src/render/Viewport"), {
  ssr: false,
  loading: () => null,
});

export default function CanvasClient({ payload }: { payload: CityPayload }) {
  return <Viewport payload={payload} />;
}
