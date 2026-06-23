import type { AgentGraph } from "./agentGraph";

// Flat, GPU-friendly form of the agent graph for the TSL compute kernel (ADR-R06).
// Edges are approximated as straight segments node-to-node (the kernel does not
// walk polylines; the CPU fallback keeps full polyline fidelity), and adjacency is
// CSR: csrOffset[n]..csrOffset[n+1] indexes a contiguous run in csrEdges of the
// edge indices leaving node n. Pure and THREE-free, unit-tested.
export type GpuGraph = {
  nodeCount: number;
  edgeCount: number;
  edgeP0: Float32Array; // 2 per edge: start [x, z]
  edgeP1: Float32Array; // 2 per edge: end [x, z]
  edgeLen: Float32Array; // straight length
  edgeSpeed: Float32Array; // congested speed, m/s
  edgeFree: Float32Array; // free-flow speed, m/s
  edgeTo: Uint32Array; // destination node index
  csrOffset: Uint32Array; // nodeCount + 1
  csrEdges: Uint32Array; // edgeCount, outgoing edge indices grouped by from-node
};

export function buildGpuGraph(graph: AgentGraph): GpuGraph {
  const N = graph.nodes.length;
  const E = graph.edges.length;

  const edgeP0 = new Float32Array(2 * E);
  const edgeP1 = new Float32Array(2 * E);
  const edgeLen = new Float32Array(E);
  const edgeSpeed = new Float32Array(E);
  const edgeFree = new Float32Array(E);
  const edgeTo = new Uint32Array(E);

  for (let i = 0; i < E; i++) {
    const e = graph.edges[i];
    const p0 = e.pts[0];
    const p1 = e.pts[e.pts.length - 1];
    edgeP0[2 * i] = p0[0];
    edgeP0[2 * i + 1] = p0[1];
    edgeP1[2 * i] = p1[0];
    edgeP1[2 * i + 1] = p1[1];
    edgeLen[i] = Math.max(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 1e-4);
    edgeSpeed[i] = e.speedMps;
    edgeFree[i] = e.freeMps;
    edgeTo[i] = e.to;
  }

  const csrOffset = new Uint32Array(N + 1);
  for (let n = 0; n < N; n++) {
    csrOffset[n + 1] = csrOffset[n] + (graph.outgoing[n]?.length ?? 0);
  }
  const csrEdges = new Uint32Array(csrOffset[N]);
  let k = 0;
  for (let n = 0; n < N; n++) {
    const out = graph.outgoing[n];
    if (out) for (const ei of out) csrEdges[k++] = ei;
  }

  return {
    nodeCount: N,
    edgeCount: E,
    edgeP0,
    edgeP1,
    edgeLen,
    edgeSpeed,
    edgeFree,
    edgeTo,
    csrOffset,
    csrEdges,
  };
}
