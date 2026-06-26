import path from "path";
import { loadCityModel } from "../model/loadCityModel";
import { loadRoadNetwork } from "../network/build";
import { toRoutableGraph } from "../traffic/routableGraph";
import { buildClusterCentroids } from "../render/cityIndex";
import { computeModelBounds } from "../render/cityGeometry";
import type { BuildingForScene } from "../mutation/building";
import type { GenerativeContext } from "../generate/types";
import type { ExpandOpts } from "../generate/expand";
import type { ModelBounds } from "../render/types";

// Build the server-side generative context from the baked data, with the SAME derivations the client
// uses (app/page.tsx + Scene), so the agent's server expansion and the client's re-expansion of the
// streamed ops produce identical geometry. That equality is the determinism contract the G5 signature
// gate checks: roadCenterlines, opts, cluster centroids, and the real graph must match the client's.
export async function buildServerContext(): Promise<{
  ctx: GenerativeContext;
  opts: ExpandOpts;
  bounds: ModelBounds;
  buildings: BuildingForScene[];
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
  const bounds = computeModelBounds(buildings);

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

  const ctx: GenerativeContext = {
    namedRegions: {},
    streets: {},
    districtBoundaries: {},
    clusterCentroids,
    realGraph,
    roadCenterlines,
  };
  // Must equal the client's genOpts in Scene.tsx, or the signatures will not match.
  const opts: ExpandOpts = {
    metresPerStorey: model.sources.metresPerStorey,
    snapRadiusM: 60,
    roadBufferM: 14,
  };

  return { ctx, opts, bounds, buildings };
}
