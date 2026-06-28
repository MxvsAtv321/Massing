import { lonLatToWebmercator } from "../coords/webmercator";
import { resolveHeight, TIER_SRC, type HeightTier, type RawHeightProps } from "./heightTiers";
import type { SourceManifest } from "../model/types";

// Build the canonical snapshot files from raw ingested data (I4): the footprints GeoJSON in EPSG:3857
// with the manifest's field names, and the per-city manifest. Pure and THREE-free, so the transform is
// unit-tested and the same output the live ingest script writes is what the loader reads. Roads are
// handled separately (the OSM drivable graph, reusing fetch-network's RawNetworkFile shape).

export type RawBuilding = RawHeightProps & {
  id: string;
  ringLonLat: [number, number][]; // outer ring, lon/lat (OSM or city open data)
};

type FootprintFeature = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: Record<string, unknown>;
};

export type FootprintCollection = { type: "FeatureCollection"; features: FootprintFeature[] };

export type IngestStats = {
  total: number;
  included: number;
  excludedNoHeight: number;
  byTier: Record<HeightTier, number>;
};

// Convert raw buildings to the canonical footprints collection, resolving each height by tier and
// excluding any building with no height. Footprints are reprojected lon/lat -> 3857 so the loader's
// existing path consumes them. HEIGHT_SRC carries the tier, which the manifest maps to a confidence.
export function buildFootprints(buildings: RawBuilding[]): {
  fc: FootprintCollection;
  stats: IngestStats;
} {
  const features: FootprintFeature[] = [];
  const stats: IngestStats = {
    total: buildings.length,
    included: 0,
    excludedNoHeight: 0,
    byTier: { measured: 0, "osm-height": 0, "osm-levels": 0 },
  };

  for (const b of buildings) {
    const h = resolveHeight(b);
    if (!h) {
      stats.excludedNoHeight++;
      continue;
    }
    const ring = b.ringLonLat.map(([lon, lat]) => lonLatToWebmercator(lon, lat));
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { id: b.id, AVG_HEIGHT: h.height, HEIGHT_SRC: h.src },
    });
    stats.included++;
    stats.byTier[h.tier]++;
  }

  return { fc: { type: "FeatureCollection", features }, stats };
}

export type CityIngestConfig = {
  cityId: string;
  displayName: string;
  ianaZone: string;
  datasetName: string;
  datasetUrl: string;
  retrievedDate: string; // ISO date
};

// The per-city manifest. The heightAccuracyBySource keys equal the HEIGHT_SRC strings the footprints
// write, so the loader maps each building to a confidence by its tier: measured is high confidence,
// building:levels-derived is the weakest, the thin-data case the confidence layer surfaces.
export function buildCityManifest(c: CityIngestConfig): SourceManifest {
  return {
    cityId: c.cityId,
    displayName: c.displayName,
    dataset: c.datasetName,
    datasetUrl: c.datasetUrl,
    license: "Open Database License (ODbL) 1.0",
    vintage: c.retrievedDate.slice(0, 4),
    retrievedDate: c.retrievedDate,
    sourceCrs: "EPSG:3857",
    accuracyDisclaimer:
      "Heights are tiered by source provenance; building:levels-derived heights are estimates, not measured.",
    heightField: "AVG_HEIGHT",
    groundField: "SURF_ELEV",
    heightMslField: "HEIGHT_MSL",
    // A sentinel that never matches: ingested footprints carry no SURF_ELEV, so nothing is filtered.
    artifactFilter: { field: "SURF_ELEV", value: -9999, epsilon: 0.01 },
    sourceField: "HEIGHT_SRC",
    heightAccuracyBySource: {
      [TIER_SRC.measured]: { kind: "measured", sigma_m: 0.5, note: "city LiDAR-derived height" },
      [TIER_SRC["osm-height"]]: { kind: "estimated", sigma_m: 2.5, note: "OSM height tag" },
      [TIER_SRC["osm-levels"]]: {
        kind: "estimated",
        sigma_m: 5.0,
        note: "OSM building:levels times an assumed storey height, the weakest tier",
      },
    },
    defaultHeightAccuracy: { kind: "estimated", sigma_m: 5.0 },
    metresPerStorey: 3.0,
    ianaZone: c.ianaZone,
    bandScopeNote: "Heights are tiered by provenance (I4); the confidence travels with each building.",
  };
}
