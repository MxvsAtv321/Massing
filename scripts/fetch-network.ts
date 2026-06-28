import * as fs from "fs";
import * as path from "path";
import type {
  BBox,
  DrivableFilter,
  NetworkManifest,
  RawNetworkFile,
  RawNode,
  RawWay,
  RawWayTags,
} from "../src/network/types";

// ---------------------------------------------------------------------------
// Acquisition script for the OSM drivable street network. Run by a developer to refresh
// the baked snapshot (data/network.json); the app never fetches at build or runtime.
// Mirrors the bake-do-not-fetch approach used for the building snapshot.
//
//   pnpm fetch:network
// ---------------------------------------------------------------------------

// Catchment, larger than the building clip so traffic enters and leaves through the
// cordon arterials (Queen St E north, Parliament St east, Yonge/Bay west, the rail
// corridor / The Esplanade south). See docs/traffic-architecture.md section 4.2.
const BBOX: BBox = { south: 43.64, west: -79.385, north: 43.654, east: -79.365 };

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Drivable filter mirroring osmnx's "drive" network type. See ADR-007 and
// docs/traffic-architecture.md section 4.4.
const INCLUDE: string[] = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "*_link ramps of the above",
];

const EXCLUDE: string[] = [
  "footway",
  "cycleway",
  "path",
  "pedestrian",
  "steps",
  "track",
  "bridleway",
  "corridor",
  "service",
  "construction",
  "proposed",
  "raceway",
  "busway",
  "bus_guideway",
  "platform",
  "elevator",
  "escalator",
  "abandoned",
  "planned",
];

function buildQuery(b: BBox): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  const excl = EXCLUDE.join("|");
  return [
    `[out:json][timeout:120][bbox:${bbox}];`,
    `(`,
    `  way["highway"]`,
    `     ["highway"!~"^(${excl})$"]`,
    `     ["area"!~"yes"]`,
    `     ["motor_vehicle"!~"no"]`,
    `     ["motorcar"!~"no"]`,
    `     ["access"!~"^(private|no)$"];`,
    `);`,
    `out body;`,
    `>;`,
    `out skel qt;`,
  ].join("\n");
}

// Overpass JSON element shapes (only the fields we use).
type OverpassNode = { type: "node"; id: number; lat: number; lon: number };
type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
};
type OverpassElement = OverpassNode | OverpassWay | { type: string };
type OverpassResponse = { elements: OverpassElement[] };

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

async function main(): Promise<void> {
  const query = buildQuery(BBOX);
  console.log("Fetching OSM drivable network from Overpass...");
  console.log(query);

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "massing-traffic/0.1 (Velocity Future Cities hackathon)",
    },
    body: "data=" + encodeURIComponent(query),
  });

  if (!res.ok) {
    throw new Error(`Overpass returned ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as OverpassResponse;

  const nodes: RawNode[] = [];
  const ways: RawWay[] = [];

  for (const el of data.elements) {
    if (el.type === "node") {
      const n = el as OverpassNode;
      nodes.push({ id: n.id, lon: n.lon, lat: n.lat });
    } else if (el.type === "way") {
      const w = el as OverpassWay;
      ways.push({ id: w.id, nodes: w.nodes, tags: normalizeTags(w.tags) });
    }
  }

  const drivableFilter: DrivableFilter = {
    include: INCLUDE,
    exclude: EXCLUDE,
    note:
      "Mirrors osmnx 'drive'. Service roads excluded (parking aisles, driveways, alleys). " +
      "Also excluded: area=yes, access=private|no, motor_vehicle=no, motorcar=no.",
  };

  const provenance: NetworkManifest = {
    source: "OpenStreetMap",
    license: "Open Database License (ODbL) 1.0",
    attribution: "(c) OpenStreetMap contributors",
    api: "Overpass API",
    query,
    retrievedDate: new Date().toISOString().slice(0, 10),
    bbox: BBOX,
    drivableFilter,
  };

  const out: RawNetworkFile = { provenance, nodes, ways };

  const outPath = path.resolve(__dirname, "..", "data", "cities", "toronto", "network.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`\nWrote ${outPath}`);
  console.log(`  ${nodes.length} nodes, ${ways.length} drivable ways`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
