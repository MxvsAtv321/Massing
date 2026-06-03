import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { Scene } from "../src/scene/Scene";
import { buildClusterProvenances } from "../src/honesty/confidence";
import type { BuildingForScene } from "../src/scene/buildings";
import type { FooterSourcesSlice } from "../src/honesty/footer";

export default async function Page() {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
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
    />
  );
}
