"use client";

import { useMemo } from "react";
import type * as THREE from "three/webgpu";
import { useThree, useFrame } from "@react-three/fiber";
import { buildAgentGraph, type AgentGraphData } from "../sim/agentGraph";
import { createTrafficCompute } from "./trafficCompute";
import { TrafficCPU } from "./TrafficCPU";
import { carLightGain } from "./carLook";
import { daylightLive } from "./daylightStore";

// GPU compute path: agents advected entirely on the GPU (ADR-R12). If the kernel
// cannot be built it returns null and we fall back to the CPU path, so a problem
// degrades gracefully instead of black-screening (ADR-R01). The count is tuned for
// the look, not the limit: enough cars to read as flowing traffic with real gaps
// between them, not bumper-to-bumper. The kernel scales far past this.
const AGENT_COUNT = 5000;
const SEED = 90210;

export function TrafficGPU({ network }: { network: AgentGraphData }) {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const graph = useMemo(() => buildAgentGraph(network), [network]);
  const system = useMemo(
    () => createTrafficCompute(gl, graph, AGENT_COUNT, SEED),
    [gl, graph]
  );

  useFrame((_, delta) => {
    if (system) system.update(delta, carLightGain(daylightLive.dayFactor));
  });

  if (!system) return <TrafficCPU network={network} />;
  return <primitive object={system.mesh} />;
}
