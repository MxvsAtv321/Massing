import type { Confidence } from "../model/types";

// Road classification, normalized from the OSM highway tag. The "_link" ramp variants
// map to their base class (motorway_link -> motorway, etc.).
export type RoadClass =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "residential"
  | "living_street"
  | "unclassified";

// ---------------------------------------------------------------------------
// Raw baked snapshot (data/network.json): lon/lat + normalized tags + provenance.
// Projection-agnostic, mirrors data/stlawrence.geojson storing raw EPSG:3857.
// The ENU reprojection happens at load, against the shared city-model origin.
// ---------------------------------------------------------------------------

export type BBox = { south: number; west: number; north: number; east: number };

export type DrivableFilter = {
  include: string[];
  exclude: string[];
  note: string;
};

export type NetworkManifest = {
  source: string; // "OpenStreetMap"
  license: string; // "Open Database License (ODbL) 1.0"
  attribution: string; // "(c) OpenStreetMap contributors"
  api: string; // "Overpass API"
  query: string; // verbatim Overpass QL used to produce the snapshot
  retrievedDate: string; // ISO date the snapshot was fetched
  bbox: BBox;
  drivableFilter: DrivableFilter;
};

export type RawNode = { id: number; lon: number; lat: number };

// Normalized tag subset we use. Other OSM tags are dropped at fetch time.
// "name" is kept for readouts, gate authoring, and debugging, not for graph logic.
export type RawWayTags = {
  highway: string;
  name: string | null;
  oneway: string | null;
  lanes: string | null;
  maxspeed: string | null;
  junction: string | null;
};

export type RawWay = { id: number; nodes: number[]; tags: RawWayTags };

export type RawNetworkFile = {
  provenance: NetworkManifest;
  nodes: RawNode[];
  ways: RawWay[];
};

// ---------------------------------------------------------------------------
// Parsed, ENU-aligned directed graph (the in-memory RoadNetwork).
// ---------------------------------------------------------------------------

export type NetworkProvenance = {
  source: string; // "OpenStreetMap"
  date: string; // snapshot retrieval date
  confidence: Confidence; // reuses the city-model Confidence union
  // Honesty hook: records attributes filled from a class default because the OSM tag
  // was missing, so later parts never mistake a default for a measured value.
  defaulted: { lanes: boolean; speed: boolean };
};

export type NetworkNode = {
  id: string; // graph node id = String(osmNodeId)
  osmNodeId: number; // source OSM node id
  enu: [number, number]; // [east, north] metres in the city ENU frame
  degree: number; // in-degree + out-degree
};

export type NetworkEdge = {
  id: string; // `${osmWayId}:${fromOsm}->${toOsm}`
  from: string; // node id
  to: string; // node id
  geometry: [number, number][]; // ordered ENU polyline, from -> to
  lengthMetres: number; // computed from the ENU geometry
  lanes: number; // OSM lanes tag, or class default
  speedLimitKph: number; // OSM maxspeed parsed, or class default
  roadClass: RoadClass;
  oneway: boolean; // true if this edge came from a oneway way
  osmWayId: number;
  provenance: NetworkProvenance;
};

export type NetworkCoverageStats = {
  rawNodes: number;
  rawWays: number;
  undirectedSegments: number; // length>0 segments built (pre-prune)
  excludedZeroLength: number;
  excludedDanglingWays: number;
  graphNodesBeforePrune: number;
  directedEdgesBeforePrune: number;
  strandedNodes: number; // removed because not in the largest SCC
  strandedComponents: number; // number of components removed
  graphNodes: number; // kept (the routable largest SCC)
  directedEdges: number; // kept
  centerlineKm: number; // kept undirected centerline length
  connected: boolean; // kept graph is a single SCC
};

export type RoadNetwork = {
  originLatLon: [number, number]; // [lon, lat], shared with the city model
  crsNote: string;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  adjacency: Map<string, number[]>; // node id -> outgoing edge indices into edges[]
  provenance: NetworkManifest;
  coverage: NetworkCoverageStats;
};
