export type ConnectivityResult = {
  components: number; // number of strongly connected components
  largestComponentNodes: number;
  strandedNodeIds: string[]; // nodes not in the largest SCC
};

// Just the graph fields connectivity needs (node ids, edge targets, and the out-edge adjacency), so
// it runs on any graph in this shape: the road network before pruning (RoadNetwork satisfies it),
// and the generated district graph the stitching gate checks (src/generate/stitch.ts, ADR-R23).
type GraphView = {
  nodes: { id: string }[];
  edges: { to: string }[];
  adjacency: Map<string, number[]>;
};

// Iterative Tarjan strongly-connected-components over the directed graph. Iterative to
// avoid call-stack overflow on larger graphs. A routable network should be one dominant
// SCC; nodes outside it are stranded (you can reach them or leave them but not both).
export function analyzeConnectivity(network: GraphView): ConnectivityResult {
  const { nodes, edges, adjacency } = network;
  const N = nodes.length;
  if (N === 0) {
    return { components: 0, largestComponentNodes: 0, strandedNodeIds: [] };
  }

  const indexOf = new Map<string, number>();
  nodes.forEach((nd, i) => indexOf.set(nd.id, i));

  const index = new Array<number>(N).fill(-1);
  const lowlink = new Array<number>(N).fill(0);
  const onStack = new Array<boolean>(N).fill(false);
  const stack: number[] = [];
  const compId = new Array<number>(N).fill(-1);
  let counter = 0;
  let nComp = 0;

  for (let s = 0; s < N; s++) {
    if (index[s] !== -1) continue;

    const work: { u: number; ei: number }[] = [{ u: s, ei: 0 }];
    index[s] = lowlink[s] = counter++;
    stack.push(s);
    onStack[s] = true;

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const u = frame.u;
      const outEdges = adjacency.get(nodes[u].id) ?? [];

      if (frame.ei < outEdges.length) {
        const w = indexOf.get(edges[outEdges[frame.ei]].to)!;
        frame.ei++;
        if (index[w] === -1) {
          index[w] = lowlink[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          work.push({ u: w, ei: 0 });
        } else if (onStack[w] && index[w] < lowlink[u]) {
          lowlink[u] = index[w];
        }
      } else {
        // Finished u. If it is an SCC root, pop the component.
        if (lowlink[u] === index[u]) {
          for (;;) {
            const w = stack.pop()!;
            onStack[w] = false;
            compId[w] = nComp;
            if (w === u) break;
          }
          nComp++;
        }
        work.pop();
        // Propagate lowlink up to the parent frame.
        if (work.length > 0) {
          const parent = work[work.length - 1].u;
          if (lowlink[u] < lowlink[parent]) lowlink[parent] = lowlink[u];
        }
      }
    }
  }

  const sizes = new Array<number>(nComp).fill(0);
  for (let i = 0; i < N; i++) sizes[compId[i]]++;

  let largestComp = 0;
  let largestSize = 0;
  for (let c = 0; c < nComp; c++) {
    if (sizes[c] > largestSize) {
      largestSize = sizes[c];
      largestComp = c;
    }
  }

  const strandedNodeIds: string[] = [];
  for (let i = 0; i < N; i++) {
    if (compId[i] !== largestComp) strandedNodeIds.push(nodes[i].id);
  }

  return { components: nComp, largestComponentNodes: largestSize, strandedNodeIds };
}
