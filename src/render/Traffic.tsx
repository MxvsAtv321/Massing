"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import { useFrame } from "@react-three/fiber";
import {
  buildAgentGraph,
  sampleEdge,
  type AgentGraphData,
} from "../sim/agentGraph";
import { spawnAgents, stepAgents } from "../sim/agents";

// CPU reference advection (5b): a modest population stepped on the main thread,
// drawn as one InstancedMesh of glowing capsules. This is also the WebGL2 fallback
// path; the GPU compute kernel scales it to ~40k in 5c. Agents ARE copies, so
// InstancedMesh is correct here (the opposite of the city's BatchedMesh, ADR-R09).
const AGENT_COUNT = 2000;
const SEED = 90210;
const MAX_DT = 1 / 30; // clamp so a stall cannot teleport agents across the map
const Y_CAR = 0.9; // ride just above the road ribbons (Y_OFFSET 0.08)

// Cool/bright when free-flowing, warm red when crawling; HDR (> 1) so they bloom.
const FREE_COLOR = new THREE.Color(0.6, 0.8, 1.3);
const JAM_COLOR = new THREE.Color(1.5, 0.3, 0.15);

export function Traffic({ network }: { network: AgentGraphData }) {
  const graph = useMemo(() => buildAgentGraph(network), [network]);
  const agents = useMemo(() => spawnAgents(graph, AGENT_COUNT, SEED), [graph]);

  const mesh = useMemo(() => {
    const geo = new THREE.CapsuleGeometry(0.9, 2.2, 4, 8);
    geo.rotateX(Math.PI / 2); // lay the long axis along +Z (travel forward)
    const material = new THREE.MeshBasicNodeMaterial({ toneMapped: false });
    const m = new THREE.InstancedMesh(geo, material, AGENT_COUNT);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; // agents span the whole city; never cull the batch
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < AGENT_COUNT; i++) m.setColorAt(i, c);
    return m;
  }, []);

  const dummy = useRef(new THREE.Object3D());
  const color = useRef(new THREE.Color());

  useFrame((_, delta) => {
    stepAgents(agents, graph, Math.min(delta, MAX_DT));

    const d = dummy.current;
    const col = color.current;
    for (let a = 0; a < agents.count; a++) {
      const e = graph.edges[agents.edge[a]];
      const s = sampleEdge(e, agents.dist[a]);
      d.position.set(s.x, Y_CAR, s.z);
      d.rotation.set(0, Math.atan2(s.dirX, s.dirZ), 0);
      d.updateMatrix();
      mesh.setMatrixAt(a, d.matrix);

      const ratio = e.freeMps > 0 ? Math.min(1, e.speedMps / e.freeMps) : 1;
      mesh.setColorAt(a, col.copy(JAM_COLOR).lerp(FREE_COLOR, ratio));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
