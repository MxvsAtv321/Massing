"use client";

import { useThree } from "@react-three/fiber";
import { TrafficGPU } from "./TrafficGPU";
import { TrafficCPU } from "./TrafficCPU";
import type { AgentGraphData } from "../sim/agentGraph";

// Living traffic: glowing capsules advected on the directed graph at the flow
// speed. WebGPU runs the GPU compute kernel (~40k agents, ADR-R12); the WebGL2
// fallback runs the CPU reference at a smaller count, visibly lesser by decision
// (ADR-R01/R08).
export function Traffic({ network }: { network: AgentGraphData }) {
  const gl = useThree((s) => s.gl);
  const isWebGPU = Boolean(
    (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
      ?.isWebGPUBackend
  );
  return isWebGPU ? (
    <TrafficGPU network={network} />
  ) : (
    <TrafficCPU network={network} />
  );
}
