import fs from "fs";
import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { exampleScenario } from "../src/traffic/demand";
import { toRoutableGraph } from "../src/traffic/routableGraph";
import { assignWithBand, type ODNodeFlow } from "../src/traffic/assignment";
import { dedupKey, clampCongestion } from "../src/render/flowField";
import type { BuildingForScene } from "../src/mutation/building";
import type { StreetSegment } from "../src/render/types";
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

  // Max v/c per undirected centerline, so a ribbon shows its busier direction.
  const vcByKey = new Map<string, number>();
  for (const e of roadNetwork.edges) {
    const ef = flow.perEdge.get(e.id);
    if (!ef) continue;
    const key = dedupKey(e.osmWayId, e.from, e.to);
    vcByKey.set(key, Math.max(vcByKey.get(key) ?? 0, ef.vcMid));
  }

  // Dedupe the directed graph to undirected centerlines for rendering: a two-way
  // street is two opposing edges sharing one geometry.
  const seen = new Set<string>();
  const streets: StreetSegment[] = [];
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
  }

  return (
    <CanvasClient
      payload={{
        buildings,
        streets,
        clusters: model.clusters,
        originLatLon: model.originLatLon,
        metresPerStorey: model.sources.metresPerStorey,
      }}
    />
  );
}
