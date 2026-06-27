import path from "path";
import { loadCityModel } from "../model/loadCityModel";
import { loadRoadNetwork } from "../network/build";
import { toRoutableGraph } from "../traffic/routableGraph";
import { buildClusterCentroids } from "../render/cityIndex";
import type { BuildingForScene } from "../mutation/building";
import type { GenerativeContext } from "../generate/types";
import type { ExpandOpts } from "../generate/expand";

// Build the server-side generative context from the baked data, with the SAME derivations the client
// uses (app/page.tsx + Scene), so the agent's server expansion and the client's re-expansion of the
// streamed ops produce identical geometry. That equality is the determinism contract the G5 signature
// gate checks: roadCenterlines, opts, cluster centroids, and the real graph must match the client's.
// THREE-free, so it stays a clean server module (no three import pulled into the route).
export async function buildServerContext(): Promise<{
  ctx: GenerativeContext;
  opts: ExpandOpts;
}> {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
  );
  const network = loadRoadNetwork(
    path.join(process.cwd(), "data", "network.json"),
    model.originLatLon
  );
  const graph = toRoutableGraph(network);

  const buildings: BuildingForScene[] = model.buildings.map((b) => ({
    id: b.id,
    footprint: b.footprint,
    heightValue: b.height.value,
    clusterId: b.clusterId,
    confidenceKind:
      b.height.confidence.kind === "measured"
        ? "measured"
        : b.height.confidence.kind === "estimated"
          ? "estimated"
          : "hypothetical",
  }));
  // Cluster centroids in ENU (cityIndex maps to world [x, z] = [east, -north], so flip z).
  const centroids = buildClusterCentroids(buildings);
  const clusterCentroids: Record<string, [number, number]> = {};
  for (const [cid, [x, z]] of centroids) clusterCentroids[cid] = [x, -z];

  // The road mask is a min-distance test, so the directed edge geometries give the same result as the
  // client's deduped centerlines (duplicate or reversed lines do not change the nearest distance).
  const roadCenterlines = network.edges.map((e) => e.geometry);
  const realGraph = {
    nodes: graph.nodes.map((n) => ({ id: n.id, enu: n.enu })),
    edges: graph.edges.map((e) => ({ from: e.from, to: e.to, lengthMetres: e.lengthMetres })),
  };

  // The waterfront anchor: a placed line at the slice's south edge for the step-down gradient to
  // descend toward (ADR-R16 register, a designated analysis anchor, never a measured Toronto feature).
  // Computed from the model bounds the same way the client does, so the gradient, and thus the
  // signature, matches. THREE-free.
  const b = boundsOf(buildings);
  const waterEdge: [number, number][] = [
    [b.cx - b.r, b.cy - b.r],
    [b.cx + b.r, b.cy - b.r],
  ];

  const ctx: GenerativeContext = {
    namedRegions: {},
    streets: {},
    districtBoundaries: {},
    clusterCentroids,
    realGraph,
    roadCenterlines,
    waterEdge,
  };
  // Must equal the client's genOpts in Scene.tsx, or the signatures will not match.
  const opts: ExpandOpts = {
    metresPerStorey: model.sources.metresPerStorey,
    snapRadiusM: 60,
    roadBufferM: 14,
  };

  return { ctx, opts };
}

// Model bounds, THREE-free, the same square center and radius computeModelBounds produces, so the
// waterEdge derived from it matches the client's.
function boundsOf(buildings: BuildingForScene[]): { cx: number; cy: number; r: number } {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const b of buildings) {
    for (const ring of b.footprint) {
      for (const [e, n] of ring) {
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        if (n < minN) minN = n;
        if (n > maxN) maxN = n;
      }
    }
  }
  if (!isFinite(minE)) return { cx: 0, cy: 0, r: 100 };
  return {
    cx: (minE + maxE) / 2,
    cy: (minN + maxN) / 2,
    r: Math.max(maxE - minE, maxN - minN) / 2 || 100,
  };
}
