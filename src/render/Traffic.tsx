"use client";

import { useThree } from "@react-three/fiber";
import { TrafficGPU } from "./TrafficGPU";
import { TrafficCPU } from "./TrafficCPU";
import type { AgentGraphData } from "../sim/agentGraph";
import type { FlowEngine } from "./flowEngine";

// Living traffic: glowing capsules advected on the directed graph at the flow
// speed. WebGPU runs the GPU compute kernel (ADR-R12); the WebGL2 fallback runs the
// CPU reference at a smaller count, visibly lesser by decision (ADR-R01/R08). Both
// take the flow engine so a re-solve on a city edit slows the agents (5e).
export function Traffic({
  network,
  flow,
}: {
  network: AgentGraphData;
  flow?: FlowEngine;
}) {
  const gl = useThree((s) => s.gl);
  const isWebGPU = Boolean(
    (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
      ?.isWebGPUBackend
  );
  return isWebGPU ? (
    <TrafficGPU network={network} flow={flow} />
  ) : (
    <TrafficCPU network={network} flow={flow} />
  );
}
