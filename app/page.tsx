import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
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

  // Dedupe the directed graph to undirected centerlines for rendering: a two-way
  // street is two opposing edges sharing one geometry.
  const seen = new Set<string>();
  const streets: StreetSegment[] = [];
  for (const e of roadNetwork.edges) {
    const key = `${e.osmWayId}:${[e.from, e.to].sort().join("-")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    streets.push({ path: e.geometry, lanes: e.lanes, roadClass: e.roadClass });
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
