import * as fs from "fs";
import { webmercatorToLonLat } from "../coords/webmercator";
import { lonLatToEnu } from "../coords/enu";
import { buildClusters } from "./grouping";
import type {
  Building,
  CityModel,
  CoverageStats,
  HeightAccuracyEntry,
  SourceManifest,
  Confidence,
} from "./types";

// GeoJSON geometry types used internally.
type Position = number[]; // [x, y, z?] in EPSG:3857
type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
type Geometry = PolygonGeometry | MultiPolygonGeometry;

type GeoJSONFeature = {
  type: "Feature";
  geometry: Geometry;
  properties: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertManifest(manifest: SourceManifest): void {
  if (!manifest.heightField) {
    throw new Error("Manifest missing required field: heightField");
  }
  if (!manifest.ianaZone) {
    throw new Error("Manifest missing required field: ianaZone");
  }
  if (!manifest.cityId) {
    throw new Error("Manifest missing required field: cityId");
  }
  if (!manifest.defaultHeightAccuracy) {
    throw new Error("Manifest missing required field: defaultHeightAccuracy");
  }
  const sigma = manifest.defaultHeightAccuracy.sigma_m;
  if (sigma == null || !Number.isFinite(sigma)) {
    throw new Error(
      `Manifest defaultHeightAccuracy.sigma_m is null or NaN: ${sigma}`
    );
  }
  // Validate all entries in heightAccuracyBySource as well.
  for (const [src, entry] of Object.entries(manifest.heightAccuracyBySource)) {
    if (entry.sigma_m == null || !Number.isFinite(entry.sigma_m)) {
      throw new Error(
        `Manifest heightAccuracyBySource["${src}"].sigma_m is null or NaN: ${entry.sigma_m}`
      );
    }
  }
}

function accuracyToConfidence(entry: HeightAccuracyEntry): Confidence {
  if (entry.kind === "measured") {
    return { kind: "measured", sigma_m: entry.sigma_m };
  }
  return { kind: "estimated", sigma_m: entry.sigma_m };
}

// ---------------------------------------------------------------------------
// Reprojection: rings of 3D 3857 positions -> rings of [east, north] ENU pairs
// ---------------------------------------------------------------------------

function reprojectRings(
  rings: Position[][],
  lon0: number,
  lat0: number
): number[][][] {
  return rings.map((ring) =>
    ring.map((pos) => {
      const [lon, lat] = webmercatorToLonLat(pos[0], pos[1]);
      return lonLatToEnu(lon, lat, lon0, lat0);
    })
  );
}

// ---------------------------------------------------------------------------
// Centroid computation over all 3857 vertices -> geodetic origin
// ---------------------------------------------------------------------------

function computeOrigin(features: GeoJSONFeature[]): [number, number] {
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;

  function accumulateRings(rings: Position[][]): void {
    for (const ring of rings) {
      for (const pos of ring) {
        const [lon, lat] = webmercatorToLonLat(pos[0], pos[1]);
        sumLon += lon;
        sumLat += lat;
        count++;
      }
    }
  }

  for (const feat of features) {
    const geom = feat.geometry;
    if (geom.type === "Polygon") {
      accumulateRings(geom.coordinates);
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        accumulateRings(poly);
      }
    }
  }

  if (count === 0) throw new Error("No vertices found to compute origin");
  return [sumLon / count, sumLat / count];
}

// ---------------------------------------------------------------------------
// Ring validity check
// ---------------------------------------------------------------------------

function isValidRing(ring: Position[]): boolean {
  // A valid polygon ring has at least 4 positions (3 distinct + closing repeat).
  return ring.length >= 4;
}

function isValidGeometry(rings: Position[][]): boolean {
  if (rings.length === 0) return false;
  // Outer ring must be valid; holes are allowed to be absent.
  return isValidRing(rings[0]);
}

// ---------------------------------------------------------------------------
// parseCityModel: pure function, no I/O. Tests call this with inline fixtures.
// ---------------------------------------------------------------------------

export function parseCityModel(
  fc: FeatureCollection,
  manifest: SourceManifest
): CityModel {
  assertManifest(manifest);

  const {
    heightField,
    groundField,
    heightMslField,
    artifactFilter,
    sourceField,
    heightAccuracyBySource,
    defaultHeightAccuracy,
    dataset,
    vintage,
  } = manifest;

  const coverage: CoverageStats = {
    included: 0,
    excludedMissingHeight: 0,
    excludedInvalidGeometry: 0,
    excludedArtifact: 0,
    heightMslMismatches: 0,
    heightMslUnpopulated: 0,
  };

  // Two-pass: first pass collects valid features to compute the centroid origin.
  // Second pass reprojects using that origin.

  // Collect valid polygon rings (pre-reprojection) to compute the origin.
  type ValidEntry = {
    id: string;
    rings: Position[][];    // outer ring + holes in 3857
    avgHeight: number;
    srcValue: string | null;
    heightMsl: number | null;
    surfElev: number | null;
  };

  const validEntries: ValidEntry[] = [];

  for (const feat of fc.features) {
    const props = feat.properties;
    const geom = feat.geometry;

    // Step 1: artifact filter.
    const surfElev =
      typeof props[groundField] === "number" ? (props[groundField] as number) : null;
    if (
      surfElev !== null &&
      Math.abs(surfElev - artifactFilter.value) <= artifactFilter.epsilon
    ) {
      coverage.excludedArtifact++;
      continue;
    }

    // Step 2: extract polygon rings per geometry type; explode MultiPolygons.
    const ringGroups: { rings: Position[][]; id: string }[] = [];

    if (geom.type === "Polygon") {
      const featureId = typeof props["id"] === "string" ? props["id"] : String(props["id"] ?? "");
      ringGroups.push({ rings: geom.coordinates, id: featureId });
    } else if (geom.type === "MultiPolygon") {
      const baseId = typeof props["id"] === "string" ? props["id"] : String(props["id"] ?? "");
      geom.coordinates.forEach((poly, idx) => {
        ringGroups.push({ rings: poly, id: `${baseId}-${idx}` });
      });
    } else {
      coverage.excludedInvalidGeometry++;
      continue;
    }

    // Step 3: validate height before committing any polygon from this feature.
    const rawHeight = props[heightField];
    const avgHeight =
      typeof rawHeight === "number" && Number.isFinite(rawHeight)
        ? rawHeight
        : null;
    if (avgHeight === null) {
      // The entire feature (all sub-polygons if MultiPolygon) is excluded.
      coverage.excludedMissingHeight += ringGroups.length;
      continue;
    }

    // Step 4: HEIGHT_MSL cross-check (diagnostic only).
    const heightMsl =
      typeof props[heightMslField] === "number"
        ? (props[heightMslField] as number)
        : null;

    let unpopulated = false;
    if (heightMsl !== null && heightMsl === 0) {
      unpopulated = true;
      coverage.heightMslUnpopulated++;
    }

    if (
      !unpopulated &&
      heightMsl !== null &&
      surfElev !== null
    ) {
      const expected = avgHeight + surfElev;
      if (Math.abs(heightMsl - expected) > 0.1) {
        coverage.heightMslMismatches++;
      }
    }

    // Determine source value for this feature.
    const srcValue =
      sourceField !== null && typeof props[sourceField] === "string"
        ? (props[sourceField] as string)
        : null;

    for (const { rings, id } of ringGroups) {
      if (!isValidGeometry(rings)) {
        coverage.excludedInvalidGeometry++;
        continue;
      }
      validEntries.push({ id, rings, avgHeight, srcValue, heightMsl, surfElev });
    }
  }

  // Compute ENU origin from all valid vertices.
  const [lon0, lat0] = computeOrigin(fc.features);

  // Build Building objects.
  const buildings: Building[] = [];

  for (const entry of validEntries) {
    const { id, rings, avgHeight, srcValue } = entry;

    const enuRings = reprojectRings(rings, lon0, lat0);

    // Step 5: pick accuracy entry.
    const accuracyEntry: HeightAccuracyEntry =
      srcValue !== null && srcValue in heightAccuracyBySource
        ? heightAccuracyBySource[srcValue]
        : defaultHeightAccuracy;

    const heightProv = {
      value: avgHeight,
      source: dataset,
      date: vintage,
      confidence: accuracyToConfidence(accuracyEntry),
    };

    // Step 6: flat-ground base elevation.
    const baseElevProv = {
      value: 0,
      source: "flat-ground v1, terrain not modeled",
      date: vintage,
      confidence: { kind: "measured" as const, sigma_m: 0 },
    };

    buildings.push({
      id,
      footprint: enuRings,
      height: heightProv,
      baseElevation: baseElevProv,
      origin: "toronto-open-data",
      clusterId: "",          // filled in by buildClusters
      isTallestInCluster: false,
      heightSrc: srcValue,
    });

    coverage.included++;
  }

  // Run grouping.
  const { buildings: clusteredBuildings, clusters } = buildClusters(buildings);

  return {
    originLatLon: [lon0, lat0],
    crsNote: `local ENU, metres, origin at [${lon0.toFixed(6)}, ${lat0.toFixed(6)}]`,
    buildings: clusteredBuildings,
    clusters,
    sources: manifest,
    coverage,
  };
}

// ---------------------------------------------------------------------------
// loadCityModel: file I/O wrapper around parseCityModel.
// ---------------------------------------------------------------------------

export async function loadCityModel(
  geojsonPath: string,
  sourcesPath: string
): Promise<CityModel> {
  const fc = JSON.parse(fs.readFileSync(geojsonPath, "utf8")) as FeatureCollection;
  const manifest = JSON.parse(fs.readFileSync(sourcesPath, "utf8")) as SourceManifest;
  return parseCityModel(fc, manifest);
}
