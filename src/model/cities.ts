import * as path from "path";

// The canonical multi-city data layout (I1). Each city is a folder data/cities/<id>/ with canonical
// filenames, so onboarding a city is adding a folder, not editing loader paths (ADR-R27 builds toward
// open onboarding). Toronto is the first canonical city and the default until a city selector lands.
// Server-only (uses node path and is consumed by the fs loaders); never imported into the client bundle.
export const DEFAULT_CITY = "toronto";

export type CityFiles = {
  footprints: string; // building massing polygons (EPSG:3857 GeoJSON)
  manifest: string; // the source manifest (SourceManifest)
  network: string; // the drivable road graph
  knownHeights: string; // ground-truth heights (Toronto regression asset, not a per-city gate)
  knownRoutes: string; // ground-truth routes (Toronto regression asset)
  cordon: string; // cordon gateways
  counts: string; // traffic counts
  studyRegions: string; // authored analysis anchors
};

export function cityDir(root: string, cityId: string = DEFAULT_CITY): string {
  return path.join(root, "data", "cities", cityId);
}

export function cityFiles(root: string, cityId: string = DEFAULT_CITY): CityFiles {
  const dir = cityDir(root, cityId);
  return {
    footprints: path.join(dir, "footprints.geojson"),
    manifest: path.join(dir, "manifest.json"),
    network: path.join(dir, "network.json"),
    knownHeights: path.join(dir, "known-heights.json"),
    knownRoutes: path.join(dir, "known-routes.json"),
    cordon: path.join(dir, "cordon.json"),
    counts: path.join(dir, "traffic-counts.json"),
    studyRegions: path.join(dir, "study-regions.json"),
  };
}
