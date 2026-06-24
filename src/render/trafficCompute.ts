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
import { type AgentGraph } from "../sim/agentGraph";
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
// heading, and colour are derived in the shader from the buffers. WebGPU only.
// Returns null on any build failure so the caller falls back to the CPU path.
//
// WebGPU caps storage buffers at 8 per shader stage (maxStorageBuffersPerShaderStage),
// so the layout is packed to stay well under: compute reads/writes only the agent
// STATE (edge+dist, seed) plus the graph it needs to advect (edgeData, CSR), and the
// render derives position/heading/colour from state + geometry. Compute uses 5
// buffers, the vertex stage 3, the fragment stage 2.
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

    // Agent state, packed: (edgeIndex as float, distance along edge) + PRNG seed.
    // Edge indices are small integers, exact in f32 well below 2^24, so storing the
    // index as a float lets edge+dist share one vec2 buffer instead of two.
    const state = new Float32Array(count * 2);
    for (let a = 0; a < count; a++) {
      state[2 * a] = init.edge[a];
      state[2 * a + 1] = init.dist[a];
    }
    const aEdgeDist = instancedArray(state, "vec2");
    const aSeed = instancedArray(init.seed, "uint");

    // Static graph, packed to vec4s. edgeSeg holds the straight-edge endpoints
    // (world x,z of P0 then P1); edgeData holds (length, speed, free, toNode).
    const E = g.edgeCount;
    const seg = new Float32Array(E * 4);
    const data = new Float32Array(E * 4);
    for (let e = 0; e < E; e++) {
      seg[4 * e] = g.edgeP0[2 * e];
      seg[4 * e + 1] = g.edgeP0[2 * e + 1];
      seg[4 * e + 2] = g.edgeP1[2 * e];
      seg[4 * e + 3] = g.edgeP1[2 * e + 1];
      data[4 * e] = g.edgeLen[e];
      data[4 * e + 1] = g.edgeSpeed[e];
      data[4 * e + 2] = g.edgeFree[e];
      data[4 * e + 3] = g.edgeTo[e];
    }
    const edgeSeg = instancedArray(seg, "vec4"); // render only
    const edgeData = instancedArray(data, "vec4");
    const csrOff = instancedArray(g.csrOffset, "uint");
    const csrEdg = instancedArray(g.csrEdges, "uint");

    const dtU = uniform(0.016);

    // Compute: advance distance at the edge speed, then hand off across at most a
    // few intersections per tick, picking a downstream edge from CSR adjacency by
    // PRNG. Writes only the packed state back. (5 storage buffers.)
    const advect = Fn(() => {
      const i = instanceIndex;
      const ed = aEdgeDist.element(i);
      const ei = uint(ed.x.add(0.5)).toVar();
      const d = ed.y.toVar();
      const sd = aSeed.element(i).toVar();

      d.addAssign(edgeData.element(ei).y.mul(dtU)); // speed * dt

      for (let iter = 0; iter < 4; iter++) {
        const len = edgeData.element(ei).x.toVar();
        If(d.greaterThanEqual(len), () => {
          d.subAssign(len);
          const toNode = uint(edgeData.element(ei).w.add(0.5));
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

      aEdgeDist.element(i).assign(vec2(float(ei), d));
      aSeed.element(i).assign(sd);
    })().compute(count);

    // Render: derive the world point, heading, and speed ratio from the current
    // edge + distance, orient the capsule along travel, place it. Unlit and
    // untonemapped so the HDR colours bloom.
    const material = new THREE.MeshBasicNodeMaterial();
    material.toneMapped = false;
    material.positionNode = Fn(() => {
      const ed = aEdgeDist.element(instanceIndex);
      const ei = uint(ed.x.add(0.5));
      const d = ed.y;
      const s = edgeSeg.element(ei);
      const p0 = s.xy;
      const p1 = s.zw;
      const len = edgeData.element(ei).x.max(float(1e-4));
      const t = d.div(len).clamp(0, 1);
      const flat = mix(p0, p1, t);
      const delta = p1.sub(p0);
      const dir = delta.div(delta.length().max(float(1e-4))); // (dirX, dirZ)

      const p = positionLocal;
      const xr = p.x.mul(dir.y).add(p.z.mul(dir.x));
      const zr = p.z.mul(dir.y).sub(p.x.mul(dir.x));
      return vec3(xr, p.y, zr).add(vec3(flat.x, float(Y_CAR), flat.y));
    })();
    {
      const ed = aEdgeDist.element(instanceIndex);
      const ei = uint(ed.x.add(0.5));
      const dat = edgeData.element(ei);
      const ratio = dat.y.div(dat.z.max(float(0.01))).clamp(0, 1);
      material.colorNode = mix(
        vec3(JAM[0], JAM[1], JAM[2]),
        vec3(FREE[0], FREE[1], FREE[2]),
        ratio
      );
    }

    const geo = new THREE.CapsuleGeometry(1.0, 2.8, 4, 8);
    geo.rotateX(Math.PI / 2); // long axis along +Z (travel forward)
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.frustumCulled = false; // positions live in storage, not in the bounds
    // InstancedMesh seeds instanceMatrix to zeros, which would collapse every
    // instance to the origin; the per-instance transform comes from positionNode,
    // so set identity to pass it through untouched.
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, identity);
    mesh.instanceMatrix.needsUpdate = true;

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
