import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { Scene } from "../src/scene/Scene";
import type { BuildingForScene } from "../src/scene/buildings";

export default async function Page() {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
  );

  // Slim the client payload: only geometry and identity.
  // Provenance, sources, and coverage stay server-side until the honesty layer needs them.
  const buildings: BuildingForScene[] = model.buildings.map((b) => ({
    id: b.id,
    footprint: b.footprint,
    heightValue: b.height.value,
    clusterId: b.clusterId,
  }));

  return <Scene buildings={buildings} />;
}
