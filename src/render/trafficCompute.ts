import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  instanceIndex,
  instancedArray,
  positionLocal,
  uniform,
  uint,
  float,
  vec2,
  vec3,
  mix,
} from "three/tsl";
import type { AgentGraph } from "../sim/agentGraph";
import { buildGpuGraph } from "../sim/graphGpu";
import { spawnAgents } from "../sim/agents";

export type TrafficSystem = {
  mesh: THREE.InstancedMesh;
  update: (dt: number) => void;
};

const Y_CAR = 0.9;
const MAX_DT = 1 / 30;
const FREE = [0.6, 0.8, 1.3] as const; // cool, free-flowing (HDR)
const JAM = [1.5, 0.3, 0.15] as const; // warm red, crawling (HDR)

// Build the GPU-resident agent system (ADR-R06/R12): SoA storage buffers advanced
// by a TSL compute kernel each frame, drawn as one InstancedMesh whose position,
// heading, and colour are read from the buffers. WebGPU only. Returns null on any
// build failure so the caller can fall back to the CPU path (ADR-R01 guard).
export function createTrafficCompute(
  renderer: THREE.WebGPURenderer,
  graph: AgentGraph,
  count: number,
  seed: number
): TrafficSystem | null {
  try {
    const g = buildGpuGraph(graph);
    if (g.edgeCount === 0) return null;
    const init = spawnAgents(graph, count, seed);

    // Agent state (read + written each tick).
    const aEdge = instancedArray(Uint32Array.from(init.edge), "uint");
    const aDist = instancedArray(init.dist, "float");
    const aSeed = instancedArray(init.seed, "uint");
    // Render outputs (written by the kernel, read by the material).
    const aPos = instancedArray(count, "vec3");
    const aDir = instancedArray(count, "vec2"); // (sinθ, cosθ) = (dirX, dirZ)
    const aRatio = instancedArray(count, "float");
    // Static graph, seeded from typed arrays (count inferred from length).
    const eP0 = instancedArray(g.edgeP0, "vec2");
    const eP1 = instancedArray(g.edgeP1, "vec2");
    const eLen = instancedArray(g.edgeLen, "float");
    const eSpeed = instancedArray(g.edgeSpeed, "float");
    const eFree = instancedArray(g.edgeFree, "float");
    const eTo = instancedArray(g.edgeTo, "uint");
    const csrOff = instancedArray(g.csrOffset, "uint");
    const csrEdg = instancedArray(g.csrEdges, "uint");

    const dtU = uniform(0.016);

    const advect = Fn(() => {
      const i = instanceIndex;
      const ei = aEdge.element(i).toVar();
      const d = aDist.element(i).toVar();
      const sd = aSeed.element(i).toVar();

      d.addAssign(eSpeed.element(ei).mul(dtU));

      // Bounded handoff, unrolled (no GPU loop): cross at most a few intersections
      // per tick, choosing a downstream edge from the CSR adjacency by PRNG.
      for (let iter = 0; iter < 4; iter++) {
        If(d.greaterThanEqual(eLen.element(ei)), () => {
          d.subAssign(eLen.element(ei));
          const toNode = eTo.element(ei);
          const off0 = csrOff.element(toNode).toVar();
          const outCount = csrOff.element(toNode.add(uint(1))).sub(off0);
          If(outCount.greaterThan(uint(0)), () => {
            sd.assign(sd.mul(uint(1664525)).add(uint(1013904223)));
            const r = float(sd).div(float(4294967296));
            const pick = uint(r.mul(float(outCount)).floor());
            ei.assign(csrEdg.element(off0.add(pick)));
          });
        });
      }

      aEdge.element(i).assign(ei);
      aDist.element(i).assign(d);
      aSeed.element(i).assign(sd);

      // Straight-edge sample for position, heading, and speed ratio (for colour).
      const p0 = eP0.element(ei);
      const p1 = eP1.element(ei);
      const len = eLen.element(ei);
      const t = d.div(len).clamp(0, 1);
      const pos = mix(p0, p1, t);
      const delta = p1.sub(p0);
      const dir = delta.div(delta.length().max(float(1e-4)));
      aPos.element(i).assign(vec3(pos.x, float(Y_CAR), pos.y));
      aDir.element(i).assign(dir);
      aRatio.element(i).assign(
        eSpeed.element(ei).div(eFree.element(ei).max(float(0.01))).clamp(0, 1)
      );
    })().compute(count);

    // Render: orient the capsule along its heading and place it at its world point;
    // colour grades JAM -> FREE by speed ratio. Unlit + untonemapped so it blooms.
    const material = new THREE.MeshBasicNodeMaterial();
    material.toneMapped = false;
    material.positionNode = Fn(() => {
      const p = positionLocal;
      const dir = aDir.element(instanceIndex); // (sinθ, cosθ)
      const wp = aPos.element(instanceIndex);
      const xr = p.x.mul(dir.y).add(p.z.mul(dir.x));
      const zr = p.z.mul(dir.y).sub(p.x.mul(dir.x));
      return vec3(xr, p.y, zr).add(wp);
    })();
    material.colorNode = mix(
      vec3(JAM[0], JAM[1], JAM[2]),
      vec3(FREE[0], FREE[1], FREE[2]),
      aRatio.element(instanceIndex)
    );

    const geo = new THREE.CapsuleGeometry(0.9, 2.2, 4, 8);
    geo.rotateX(Math.PI / 2); // long axis along +Z (travel forward)
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.frustumCulled = false; // positions live in storage, not in the bounds

    return {
      mesh,
      update: (dt: number) => {
        dtU.value = Math.min(dt, MAX_DT);
        renderer.compute(advect);
      },
    };
  } catch (e) {
    console.warn("[massing] GPU traffic unavailable; falling back to CPU", e);
    return null;
  }
}
