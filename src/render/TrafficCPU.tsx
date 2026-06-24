"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import { useFrame } from "@react-three/fiber";
import {
  buildAgentGraph,
  sampleEdge,
  type AgentGraphData,
} from "../sim/agentGraph";
import { spawnAgents, stepAgents } from "../sim/agents";
import { carGeometry, headTailColor, carLightGain } from "./carLook";
import { daylightLive } from "./daylightStore";
import type { FlowEngine } from "./flowEngine";

// CPU reference advection: a modest population stepped on the main thread, drawn as
// one InstancedMesh of head/tail-lit cars (the shared look from carLook). The WebGL2
// fallback path, and the correctness oracle for the GPU kernel (trafficCompute).
// Agents ARE copies, so InstancedMesh is correct here (opposite of the city's
// BatchedMesh, ADR-R09). Visibly lesser than the GPU path by count, not by look.
const AGENT_COUNT = 2000;
const SEED = 90210;
const MAX_DT = 1 / 30;
const Y_CAR = 0.9;

export function TrafficCPU({
  network,
  flow,
}: {
  network: AgentGraphData;
  flow?: FlowEngine;
}) {
  const graph = useMemo(() => buildAgentGraph(network), [network]);
  const agents = useMemo(() => spawnAgents(graph, AGENT_COUNT, SEED), [graph]);

  // After a re-solve, fold the new congested speeds into the graph edges (kph -> m/s)
  // so agents slow on freshly-congested roads (5e). Edge order is 1:1 with the solve.
  useEffect(() => {
    if (!flow) return;
    const apply = () => {
      const speeds = flow.edgeSpeeds();
      if (!speeds) return;
      const m = Math.min(speeds.length, graph.edges.length);
      for (let i = 0; i < m; i++) {
        if (speeds[i] > 0) graph.edges[i].speedMps = speeds[i] / 3.6;
      }
    };
    apply();
    return flow.subscribe(apply);
  }, [flow, graph]);

  // The head/tail split is read from the car's local Z in the shader, so colour
  // needs no per-instance buffer; only the light gain varies, set each frame.
  const look = useMemo(() => headTailColor(), []);
  const mesh = useMemo(() => {
    const geo = carGeometry();
    const material = new THREE.MeshBasicNodeMaterial({ toneMapped: false });
    material.colorNode = look.colorNode;
    const m = new THREE.InstancedMesh(geo, material, AGENT_COUNT);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    return m;
  }, [look]);

  const dummy = useRef(new THREE.Object3D());

  useFrame((_, delta) => {
    stepAgents(agents, graph, Math.min(delta, MAX_DT));
    look.setGain(carLightGain(daylightLive.dayFactor));

    const d = dummy.current;
    for (let a = 0; a < agents.count; a++) {
      const e = graph.edges[agents.edge[a]];
      const s = sampleEdge(e, agents.dist[a]);
      d.position.set(s.x, Y_CAR, s.z);
      d.rotation.set(0, Math.atan2(s.dirX, s.dirZ), 0);
      d.updateMatrix();
      mesh.setMatrixAt(a, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
