import fs from "fs";
import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { Scene } from "../src/scene/Scene";
import { buildClusterProvenances } from "../src/honesty/confidence";
import type { BuildingForScene } from "../src/scene/buildings";
import type { RoadEdgeForScene, NetworkStats } from "../src/scene/roadGeometry";
import type { Place } from "../src/traffic/demand";
import type { FooterSourcesSlice } from "../src/honesty/footer";

export default async function Page() {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
  );

  // Road network shares the city model's exact ENU origin (alignment by construction).
  const roadNetwork = loadRoadNetwork(
    path.join(process.cwd(), "data", "network.json"),
    model.originLatLon
  );

  // Slim client payload: geometry, identity, and confidence kind.
  const buildings: BuildingForScene[] = model.buildings.map((b) => ({
    id: b.id,
    footprint: b.footprint,
    heightValue: b.height.value,
    clusterId: b.clusterId,
    confidenceKind:
      b.height.confidence.kind === "measured" ? "measured" : "estimated",
  }));

  // Slim road payload: one centerline per physical street (directed pairs deduped).
  const seenSeg = new Set<string>();
  const roadEdges: RoadEdgeForScene[] = [];
  for (const e of roadNetwork.edges) {
    const lo = e.from < e.to ? e.from : e.to;
    const hi = e.from < e.to ? e.to : e.from;
    const key = `${e.osmWayId}:${lo}-${hi}`;
    if (seenSeg.has(key)) continue;
    seenSeg.add(key);
    roadEdges.push({ polyline: e.geometry, roadClass: e.roadClass });
  }

  const networkStats: NetworkStats = {
    graphNodes: roadNetwork.coverage.graphNodes,
    directedEdges: roadNetwork.coverage.directedEdges,
    centerlineKm: roadNetwork.coverage.centerlineKm,
    strandedNodes: roadNetwork.coverage.strandedNodes,
    connected: roadNetwork.coverage.connected,
  };

  // Cordon gateways: through-traffic entry/exit points, resolved to network nodes.
  const cordonFile = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "cordon.json"), "utf8")
  ) as CordonFile;
  const gateways: Place[] = resolveCordon(roadNetwork, cordonFile).places;

  // Per-cluster provenance for the building info panel.
  const clusterProvenances = buildClusterProvenances(model.buildings, model.clusters);

  // Static manifest slice for the export footer.
  const sourcesFooter: FooterSourcesSlice = {
    dataset: model.sources.dataset,
    vintage: model.sources.vintage,
    retrievedDate: model.sources.retrievedDate,
    license: model.sources.license,
    accuracyDisclaimer: model.sources.accuracyDisclaimer,
    bandScopeNote: model.sources.bandScopeNote,
  };

  return (
    <Scene
      buildings={buildings}
      originLatLon={model.originLatLon}
      clusters={model.clusters}
      metresPerStorey={model.sources.metresPerStorey}
      clusterProvenances={clusterProvenances}
      sourcesFooter={sourcesFooter}
      roadEdges={roadEdges}
      networkStats={networkStats}
      gateways={gateways}
    />
  );
}
