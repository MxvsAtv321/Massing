// The directed road graph the traffic agents traverse, in world space. Built on
// the client from a slim serializable form shipped in the payload (the directed
// edges of the kept RoadNetwork plus the BPR flow speed per edge). Pure and
// THREE-free so it is unit-tested in node; the renderer only samples positions.

// Serializable shape sent server -> client. World coords are [x, z] = [east,
// -north], matching the city and street axis map. pts is the edge polyline
// from -> to (>= 2 points).
export type AgentGraphData = {
  nodes: [number, number][]; // world [x, z] per node index
  edges: {
    from: number; // node index
    to: number; // node index
    pts: [number, number][]; // world polyline, from -> to
    speedKph: number; // current congested speed (flow field)
    freeKph: number; // free-flow speed, for colour grading
  }[];
};

export type AgentEdge = {
  from: number;
  to: number;
  pts: [number, number][];
  cumLen: number[]; // cumulative length at each point; cumLen[0] = 0
  length: number; // total edge length, metres
  speedMps: number; // congested speed, metres/second
  freeMps: number; // free-flow speed, metres/second
};

export type AgentGraph = {
  nodes: [number, number][];
  edges: AgentEdge[];
  outgoing: number[][]; // node index -> outgoing edge indices
};

export function buildAgentGraph(data: AgentGraphData): AgentGraph {
  const edges: AgentEdge[] = data.edges.map((e) => {
    const cumLen = [0];
    for (let i = 1; i < e.pts.length; i++) {
      const [x0, z0] = e.pts[i - 1];
      const [x1, z1] = e.pts[i];
      cumLen.push(cumLen[i - 1] + Math.hypot(x1 - x0, z1 - z0));
    }
    const length = Math.max(cumLen[cumLen.length - 1], 1e-4);
    return {
      from: e.from,
      to: e.to,
      pts: e.pts,
      cumLen,
      length,
      speedMps: e.speedKph / 3.6,
      freeMps: e.freeKph / 3.6,
    };
  });

  const outgoing: number[][] = data.nodes.map(() => []);
  edges.forEach((e, i) => {
    if (outgoing[e.from]) outgoing[e.from].push(i);
  });

  return { nodes: data.nodes, edges, outgoing };
}

export type EdgeSample = { x: number; z: number; dirX: number; dirZ: number };

// World position and unit travel direction at distance d along an edge polyline.
export function sampleEdge(edge: AgentEdge, dist: number): EdgeSample {
  const d = Math.max(0, Math.min(edge.length, dist));
  const cum = edge.cumLen;
  let i = 1;
  while (i < cum.length && cum[i] < d) i++;
  const i0 = i - 1;
  const i1 = Math.min(i, edge.pts.length - 1);
  const [x0, z0] = edge.pts[i0];
  const [x1, z1] = edge.pts[i1];
  const segLen = Math.max(cum[i1] - cum[i0], 1e-6);
  const t = (d - cum[i0]) / segLen;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const norm = Math.hypot(dx, dz) || 1;
  return {
    x: x0 + dx * t,
    z: z0 + dz * t,
    dirX: dx / norm,
    dirZ: dz / norm,
  };
}
