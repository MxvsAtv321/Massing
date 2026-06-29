import * as fs from "fs";
import * as path from "path";
import { buildFootprints, buildCityManifest, type RawBuilding } from "../src/ingest/snapshot";
import { TIER_SRC } from "../src/ingest/heightTiers";
import type { BBox, DrivableFilter, NetworkManifest, RawNetworkFile, RawNode, RawWay, RawWayTags } from "../src/network/types";

// City ingestion (I4, ADR-R25/R26). Fetches OSM building footprints and the drivable road graph for a
// bounding box and writes a canonical data/cities/<id>/ snapshot the loader reads unchanged: footprints
// in EPSG:3857 with tiered heights, the manifest, and network.json. Bake-do-not-fetch: this is an
// offline developer step, run once per city; the app never fetches. Heights come from OSM tags here
// (height then building:levels), so an OSM-only city is the thin-data case; a city with open LiDAR plugs
// a measured source into RawBuilding.measuredHeight for the high-confidence tier.
//
//   pnpm ingest:city <cityId>
//
// Run verify:structure <cityId> after, to accept the city on structure alone.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type CityPreset = {
  cityId: string;
  displayName: string;
  ianaZone: string;
  bbox: BBox;
  buildingSource: "osm" | "nyc-open-data"; // OSM tags (estimated tier) or NYC LiDAR heights (measured)
};

const CITIES: Record<string, CityPreset> = {
  nyc: {
    cityId: "nyc",
    displayName: "Lower Manhattan, New York",
    ianaZone: "America/New_York",
    bbox: { south: 40.703, west: -74.017, north: 40.717, east: -74.0 },
    buildingSource: "nyc-open-data",
  },
  mexico: {
    cityId: "mexico",
    displayName: "Cuauhtemoc, Mexico City",
    ianaZone: "America/Mexico_City",
    bbox: { south: 19.424, west: -99.165, north: 19.438, east: -99.148 },
    buildingSource: "osm",
  },
};

// NYC Open Data Building Footprints (BUILDING_P): LiDAR-derived height_roof (feet) at building points.
// The dataset is points, not polygons, so we take OSM footprints for geometry and join these measured
// heights onto them by point-in-polygon. A footprint with a point inside reads measured; the rest fall
// back to their OSM tag (estimated) or are excluded.
const NYC_HEIGHTS = "https://data.cityofnewyork.us/resource/u9wf-3gbt.geojson";
const FT_TO_M = 0.3048;

async function fetchNycHeightPoints(b: BBox): Promise<{ lon: number; lat: number; heightM: number }[]> {
  const where = `within_box(the_geom,${b.north},${b.west},${b.south},${b.east})`;
  const url = `${NYC_HEIGHTS}?$where=${encodeURIComponent(where)}&$limit=50000`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "massing-ingest/0.1" } });
  if (!res.ok) throw new Error(`NYC Open Data ${res.status} ${res.statusText}`);
  const j = (await res.json()) as {
    features: { geometry: { type: string; coordinates: [number, number] } | null; properties: { height_roof?: string } }[];
  };
  const out: { lon: number; lat: number; heightM: number }[] = [];
  for (const f of j.features) {
    if (f.geometry?.type !== "Point") continue;
    const hFt = parseFloat(f.properties.height_roof ?? "");
    if (!(hFt > 0)) continue;
    out.push({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], heightM: hFt * FT_TO_M });
  }
  return out;
}

function pointInRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Assign each OSM footprint the measured height of the NYC building point inside it (max if several).
function joinNycHeights(
  osm: RawBuilding[],
  points: { lon: number; lat: number; heightM: number }[]
): RawBuilding[] {
  const measured = new Map<string, number>();
  for (const p of points) {
    for (const b of osm) {
      if (pointInRing(p.lon, p.lat, b.ringLonLat)) {
        measured.set(b.id, Math.max(measured.get(b.id) ?? 0, p.heightM));
        break;
      }
    }
  }
  return osm.map((b) => (measured.has(b.id) ? { ...b, measuredHeight: measured.get(b.id) } : b));
}

const INCLUDE = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "*_link ramps"];
const EXCLUDE = ["footway", "cycleway", "path", "pedestrian", "steps", "track", "bridleway", "corridor", "service", "construction", "proposed", "raceway", "busway", "bus_guideway", "platform", "elevator", "escalator", "abandoned", "planned"];

async function overpass(query: string): Promise<{ elements: OverpassElement[] }> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "massing-ingest/0.1",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}`);
  return (await res.json()) as { elements: OverpassElement[] };
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

function roadQuery(b: BBox): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  const excl = EXCLUDE.join("|");
  return [
    `[out:json][timeout:180][bbox:${bbox}];`,
    `(`,
    `  way["highway"]["highway"!~"^(${excl})$"]["area"!~"yes"]["motor_vehicle"!~"no"]["motorcar"!~"no"]["access"!~"^(private|no)$"];`,
    `);`,
    `out body;`,
    `>;`,
    `out skel qt;`,
  ].join("\n");
}

function buildingQuery(b: BBox): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return [`[out:json][timeout:180][bbox:${bbox}];`, `(way["building"];);`, `out geom;`].join("\n");
}

function normalizeTags(tags: Record<string, string> | undefined): RawWayTags {
  const t = tags ?? {};
  return {
    highway: t.highway ?? "",
    name: t.name ?? null,
    oneway: t.oneway ?? null,
    lanes: t.lanes ?? null,
    maxspeed: t.maxspeed ?? null,
    junction: t.junction ?? null,
  };
}

function leadingNumber(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function parseBuildings(elements: OverpassElement[]): RawBuilding[] {
  const out: RawBuilding[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
    if (!el.tags || !("building" in el.tags)) continue;
    out.push({
      id: `osm-${el.id}`,
      ringLonLat: el.geometry.map((g) => [g.lon, g.lat] as [number, number]),
      osmHeight: leadingNumber(el.tags.height),
      osmLevels: leadingNumber(el.tags["building:levels"]),
    });
  }
  return out;
}

// The levels variant (I7): the same baked geometry with heights relabeled as the weak tier, so the
// A/B isolates the confidence model from the geometry. The sun value barely moves; the confidence flips.
function relabelToLevels(preset: CityPreset, retrievedDate: string): void {
  const root = path.resolve(__dirname, "..", "data", "cities");
  const src = path.join(root, preset.cityId);
  if (!fs.existsSync(path.join(src, "footprints.geojson"))) {
    throw new Error(`no snapshot at data/cities/${preset.cityId}; ingest it first, then re-run with --levels`);
  }
  const outId = `${preset.cityId}-levels`;
  const dst = path.join(root, outId);
  fs.mkdirSync(dst, { recursive: true });

  const fc = JSON.parse(fs.readFileSync(path.join(src, "footprints.geojson"), "utf8")) as {
    type: string;
    features: { properties: Record<string, unknown> }[];
  };
  for (const f of fc.features) f.properties.HEIGHT_SRC = TIER_SRC["osm-levels"];
  fs.writeFileSync(path.join(dst, "footprints.geojson"), JSON.stringify(fc));
  fs.copyFileSync(path.join(src, "network.json"), path.join(dst, "network.json"));

  const manifest = buildCityManifest({
    cityId: outId,
    displayName: `${preset.displayName} (levels)`,
    ianaZone: preset.ianaZone,
    datasetName: "Heights relabeled as the levels tier, for the confidence A/B (same geometry)",
    datasetUrl: "https://www.openstreetmap.org/",
    retrievedDate,
  });
  fs.writeFileSync(path.join(dst, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote data/cities/${outId}/ (same geometry, heights labeled as the levels tier)`);
}

async function main(): Promise<void> {
  const cityId = process.argv[2];
  const preset = cityId ? CITIES[cityId] : undefined;
  if (!preset) {
    console.error(`Usage: pnpm ingest:city <cityId> [--levels]  (known: ${Object.keys(CITIES).join(", ")})`);
    process.exit(1);
  }
  const retrievedDateEarly = new Date().toISOString().slice(0, 10);
  if (process.argv.includes("--levels")) {
    relabelToLevels(preset, retrievedDateEarly);
    return;
  }
  const { bbox } = preset;
  const dir = path.resolve(__dirname, "..", "data", "cities", preset.cityId);
  fs.mkdirSync(dir, { recursive: true });
  const retrievedDate = new Date().toISOString().slice(0, 10);

  console.log(`Ingesting ${preset.displayName} (${preset.cityId})`);

  // Roads.
  const roadData = await overpass(roadQuery(bbox));
  const nodes: RawNode[] = [];
  const ways: RawWay[] = [];
  for (const el of roadData.elements) {
    if (el.type === "node" && el.lat != null && el.lon != null) nodes.push({ id: el.id, lon: el.lon, lat: el.lat });
    else if (el.type === "way" && el.nodes) ways.push({ id: el.id, nodes: el.nodes, tags: normalizeTags(el.tags) });
  }
  const drivableFilter: DrivableFilter = { include: INCLUDE, exclude: EXCLUDE, note: "Mirrors osmnx 'drive'." };
  const networkProvenance: NetworkManifest = {
    source: "OpenStreetMap",
    license: "Open Database License (ODbL) 1.0",
    attribution: "(c) OpenStreetMap contributors",
    api: "Overpass API",
    query: roadQuery(bbox),
    retrievedDate,
    bbox,
    drivableFilter,
  };
  const network: RawNetworkFile = { provenance: networkProvenance, nodes, ways };
  fs.writeFileSync(path.join(dir, "network.json"), JSON.stringify(network, null, 2));
  console.log(`  roads: ${nodes.length} nodes, ${ways.length} ways`);

  // Footprints, from the city's building source.
  let raw: RawBuilding[];
  if (preset.buildingSource === "nyc-open-data") {
    const osm = parseBuildings((await overpass(buildingQuery(bbox))).elements);
    const points = await fetchNycHeightPoints(bbox);
    raw = joinNycHeights(osm, points);
    console.log(`  joined ${points.length} NYC height points onto ${osm.length} OSM footprints`);
  } else {
    raw = parseBuildings((await overpass(buildingQuery(bbox))).elements);
  }
  const { fc, stats } = buildFootprints(raw);
  fs.writeFileSync(path.join(dir, "footprints.geojson"), JSON.stringify(fc));
  console.log(`  footprints: ${stats.included} kept, ${stats.excludedNoHeight} excluded (no height)`);
  console.log(`  height tiers: ${JSON.stringify(stats.byTier)}`);

  // Manifest.
  const datasetName =
    preset.buildingSource === "nyc-open-data"
      ? "NYC Open Data Building Footprints (LiDAR height_roof), OSM roads"
      : "OpenStreetMap buildings and roads";
  const manifest = buildCityManifest({
    cityId: preset.cityId,
    displayName: preset.displayName,
    ianaZone: preset.ianaZone,
    datasetName,
    datasetUrl: "https://www.openstreetmap.org/",
    retrievedDate,
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\nWrote data/cities/${preset.cityId}/. Next: pnpm verify:structure ${preset.cityId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
