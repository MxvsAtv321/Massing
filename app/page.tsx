import fs from "fs";
import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { exampleScenario } from "../src/traffic/demand";
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
export default async function Page() {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
  );

  const roadNetwork = loadRoadNetwork(
    path.join(process.cwd(), "data", "network.json"),
    model.originLatLon
  );

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
  const cordon = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "cordon.json"), "utf8")
  ) as CordonFile;
  const { places } = resolveCordon(roadNetwork, cordon);
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

  return (
    <CanvasClient
      payload={{
        buildings,
        streets,
        clusters: model.clusters,
        network,
        reactive,
        originLatLon: model.originLatLon,
        metresPerStorey: model.sources.metresPerStorey,
      }}
    />
  );
}
