import fs from "fs";
import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { toRoutableNodes, toRoutableEdges, type RoutableNode, type RoutableEdge } from "../src/traffic/routableGraph";
import { Scene } from "../src/scene/Scene";
import { buildClusterProvenances } from "../src/honesty/confidence";
import type { BuildingForScene } from "../src/scene/buildings";
import type { NetworkStats } from "../src/scene/roadGeometry";
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

  // Slim routable payload: directed edges (with geometry + capacity attributes) and nodes.
  // The scene derives the grey road centerlines from these and runs the flow assignment
  // on them, so the graph is sent once.
  const routableNodes: RoutableNode[] = toRoutableNodes(roadNetwork);
  const routableEdges: RoutableEdge[] = toRoutableEdges(roadNetwork);

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
      routableNodes={routableNodes}
      routableEdges={routableEdges}
      networkStats={networkStats}
      gateways={gateways}
    />
  );
}
