import type { BuildingForScene } from "../mutation/building";
import type { ClusterIndexEntry } from "../model/types";
import type { AgentGraphData } from "../sim/agentGraph";

// One drivable street centerline, deduped from the directed road graph.
export type StreetSegment = {
  path: [number, number][]; // ENU [east, north] polyline
  lanes: number;
  roadClass: string;
  congestion: number; // 0..1 max v/c across the segment's directions (flow field)
};

// Slim client payload resolved at build time from the baked city model. Carries
// the cluster index so the client can map a picked instance to its building
// identity and grade height edits against each cluster's representative height.
// Sent as a plain Record (not a Map) so it survives the server -> client boundary.
export type CityPayload = {
  buildings: BuildingForScene[];
  streets: StreetSegment[];
  clusters: Record<string, ClusterIndexEntry>;
  network: AgentGraphData; // directed graph + flow speeds, for the living traffic
  originLatLon: [number, number]; // stored [lon, lat] (loader convention)
  metresPerStorey: number;
};

export type ModelBounds = {
  center: [number, number]; // ENU [east, north] metres
  radius: number; // half the larger extent, metres
};
