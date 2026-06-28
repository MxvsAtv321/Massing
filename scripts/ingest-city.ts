import * as fs from "fs";
import * as path from "path";
import { buildFootprints, buildCityManifest, type RawBuilding } from "../src/ingest/snapshot";
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

type CityPreset = { cityId: string; displayName: string; ianaZone: string; bbox: BBox };

const CITIES: Record<string, CityPreset> = {
  nyc: {
    cityId: "nyc",
    displayName: "Lower Manhattan, New York",
    ianaZone: "America/New_York",
    bbox: { south: 40.703, west: -74.017, north: 40.717, east: -74.0 },
  },
  mexico: {
    cityId: "mexico",
    displayName: "Cuauhtemoc, Mexico City",
    ianaZone: "America/Mexico_City",
    bbox: { south: 19.424, west: -99.165, north: 19.438, east: -99.148 },
  },
};

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

async function main(): Promise<void> {
  const cityId = process.argv[2];
  const preset = cityId ? CITIES[cityId] : undefined;
  if (!preset) {
    console.error(`Usage: pnpm ingest:city <cityId>  (known: ${Object.keys(CITIES).join(", ")})`);
    process.exit(1);
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

  // Footprints.
  const buildingData = await overpass(buildingQuery(bbox));
  const raw = parseBuildings(buildingData.elements);
  const { fc, stats } = buildFootprints(raw);
  fs.writeFileSync(path.join(dir, "footprints.geojson"), JSON.stringify(fc));
  console.log(`  footprints: ${stats.included} kept, ${stats.excludedNoHeight} excluded (no height)`);
  console.log(`  height tiers: ${JSON.stringify(stats.byTier)}`);

  // Manifest.
  const manifest = buildCityManifest({
    cityId: preset.cityId,
    displayName: preset.displayName,
    ianaZone: preset.ianaZone,
    datasetName: "OpenStreetMap buildings",
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
