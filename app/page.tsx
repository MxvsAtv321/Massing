import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import type { BuildingForScene } from "../src/mutation/building";
import CanvasClient from "./_components/CanvasClient";

// Unit 1: resolve the baked city model at build time (server component) and hand
// the client island a slim payload for the lit, grounded render.
export default async function Page() {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
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

  return (
    <CanvasClient
      payload={{
        buildings,
        originLatLon: model.originLatLon,
        metresPerStorey: model.sources.metresPerStorey,
      }}
    />
  );
}
