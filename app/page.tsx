import fs from "fs";
import { loadCityModel } from "../src/model/loadCityModel";
import { cityFiles, DEFAULT_CITY } from "../src/model/cities";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { deriveCordon } from "../src/traffic/deriveCordon";
import { exampleScenario, type Place } from "../src/traffic/demand";
import { parseRegions } from "../src/study/region";
import type { AnalysisRegion } from "../src/study/studyTypes";
import { toRoutableGraph } from "../src/traffic/routableGraph";
import { assignWithBand, type ODNodeFlow } from "../src/traffic/assignment";
import { dedupKey, clampCongestion } from "../src/render/flowField";
import { buildClusterCentroids } from "../src/render/cityIndex";
import type { BuildingForScene } from "../src/mutation/building";
import type { StreetSegment, ReactiveFlowInputs } from "../src/render/types";
import type { AgentGraphData } from "../src/sim/agentGraph";
import CanvasClient from "./_components/CanvasClient";

// Unit 1+2: resolve the baked city model and road network at build time (server
// component) and hand the client island a slim payload. The network shares the
// city model's ENU origin, so streets and buildings co-register by construction.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  // Pick the city from ?city=<id>, default Toronto. Any ingested city under data/cities/ renders.
  const cityId = (await searchParams).city ?? DEFAULT_CITY;
  const files = cityFiles(process.cwd(), cityId);
  const model = await loadCityModel(files.footprints, files.manifest);

  const roadNetwork = loadRoadNetwork(files.network, model.originLatLon);

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

  // Baseline flow field: the kept BPR solver on the real graph with the cordon
  // through-traffic scenario, so streets can show congestion now and the agents
  // can read per-edge speeds later (Unit 5). Clearly simulated, not measured.
  const graph = toRoutableGraph(roadNetwork);
  // Curated cordon gateways where a city has them (Toronto), else auto-derived from the boundary roads
  // (I5), so an ingested city with no hand-placed cordon still gets a through-traffic scenario.
  let places: Place[];
  if (fs.existsSync(files.cordon)) {
    const cordon = JSON.parse(fs.readFileSync(files.cordon, "utf8")) as CordonFile;
    places = resolveCordon(roadNetwork, cordon).places;
  } else {
    places = deriveCordon(roadNetwork);
  }
  const connectorOf = new Map(places.map((p) => [p.id, p.connectorNodeId]));
  const od: ODNodeFlow[] = exampleScenario(places)
    .map((f) => ({
      fromNodeId: connectorOf.get(f.fromPlaceId),
      toNodeId: connectorOf.get(f.toPlaceId),
      tripsPerHour: f.tripsPerHour,
    }))
    .filter(
      (f): f is ODNodeFlow =>
        f.fromNodeId !== undefined && f.toNodeId !== undefined
    );
  const flow = assignWithBand(graph, od);

  // Max v/c per undirected centerline, so a ribbon shows its busier direction, and
  // the directed edge ids per centerline so a client re-solve can re-tint each ribbon.
  const vcByKey = new Map<string, number>();
  const keyToEdgeIds = new Map<string, string[]>();
  for (const e of roadNetwork.edges) {
    const key = dedupKey(e.osmWayId, e.from, e.to);
    const ids = keyToEdgeIds.get(key);
    if (ids) ids.push(e.id);
    else keyToEdgeIds.set(key, [e.id]);
    const ef = flow.perEdge.get(e.id);
    if (!ef) continue;
    vcByKey.set(key, Math.max(vcByKey.get(key) ?? 0, ef.vcMid));
  }

  // Dedupe the directed graph to undirected centerlines for rendering: a two-way
  // street is two opposing edges sharing one geometry. streetEdgeIds stays parallel.
  const seen = new Set<string>();
  const streets: StreetSegment[] = [];
  const streetEdgeIds: string[][] = [];
  for (const e of roadNetwork.edges) {
    const key = dedupKey(e.osmWayId, e.from, e.to);
    if (seen.has(key)) continue;
    seen.add(key);
    streets.push({
      path: e.geometry,
      lanes: e.lanes,
      roadClass: e.roadClass,
      congestion: clampCongestion(vcByKey.get(key) ?? 0),
    });
    streetEdgeIds.push(keyToEdgeIds.get(key) ?? [e.id]);
  }

  // Directed agent graph in world space: every directed edge keeps its polyline
  // and its congested flow speed, so agents flow with oneway/twoway and crawl
  // through the jams. World [x, z] = [east, -north], the shared axis map.
  const nodeIndex = new Map<string, number>();
  roadNetwork.nodes.forEach((n, i) => nodeIndex.set(n.id, i));
  const agentEdges = roadNetwork.edges.filter(
    (e) => nodeIndex.has(e.from) && nodeIndex.has(e.to)
  );
  const network: AgentGraphData = {
    nodes: roadNetwork.nodes.map((n) => [n.enu[0], -n.enu[1]]),
    edges: agentEdges.map((e) => ({
      from: nodeIndex.get(e.from)!,
      to: nodeIndex.get(e.to)!,
      pts: e.geometry.map(([east, north]) => [east, -north] as [number, number]),
      speedKph: flow.perEdge.get(e.id)?.speedMidKph ?? e.speedLimitKph,
      freeKph: e.speedLimitKph,
    })),
  };

  // Reactive flow inputs (5e): everything the client needs to re-solve in the
  // browser on a height edit. Edges drop geometry (the solver never reads it); the
  // cluster->node map snaps each cluster centroid to its nearest road node now, so
  // an edit is one cheap solve. World [x, z] = [east, -north], the shared axis map.
  const centroids = buildClusterCentroids(buildings);
  const clusterNodeId: Record<string, string> = {};
  for (const [cid, [x, z]] of centroids) {
    let best = "";
    let bestDist = Infinity;
    for (const n of graph.nodes) {
      const dx = n.enu[0] - x;
      const dz = -n.enu[1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = n.id;
      }
    }
    if (best) clusterNodeId[cid] = best;
  }
  const reactive: ReactiveFlowInputs = {
    edges: graph.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      lengthMetres: e.lengthMetres,
      lanes: e.lanes,
      speedLimitKph: e.speedLimitKph,
      roadClass: e.roadClass,
      oneway: e.oneway,
      defaultedLanes: e.defaultedLanes,
    })),
    baseOD: od,
    gatewayNodeIds: Array.from(new Set(places.map((p) => p.connectorNodeId))),
    streetEdgeIds,
    agentEdgeIds: agentEdges.map((e) => e.id),
    clusterNodeId,
  };

  // Real road graph (nodes with ENU + edges with lengths) the generated grid stitches to, for the
  // connectivity gate and the reachability isochrone (G4). Walk is symmetric, so directedness is
  // resolved downstream in the stitch.
  const realGraph = {
    nodes: graph.nodes.map((n) => ({ id: n.id, enu: n.enu })),
    edges: graph.edges.map((e) => ({ from: e.from, to: e.to, lengthMetres: e.lengthMetres })),
  };

  // The authored analysis anchor where a city has one (Toronto's St. James Park), else a region centered
  // on the ENU origin, which is the data centroid, so it lands over any city's middle.
  const defaultStudyRegion: AnalysisRegion = fs.existsSync(files.studyRegions)
    ? parseRegions(JSON.parse(fs.readFileSync(files.studyRegions, "utf8")))[0]
    : {
        id: "default",
        name: `${model.sources.displayName} center`,
        kind: "rect",
        center: [0, 0],
        halfExtents: [150, 150],
        rotationRad: 0,
        source: "placed",
      };

  return (
    <CanvasClient
      payload={{
        buildings,
        streets,
        clusters: model.clusters,
        network,
        reactive,
        realGraph,
        originLatLon: model.originLatLon,
        metresPerStorey: model.sources.metresPerStorey,
        ianaZone: model.sources.ianaZone,
        cityId: model.sources.cityId,
        displayName: model.sources.displayName,
        defaultStudyRegion,
      }}
    />
  );
}
