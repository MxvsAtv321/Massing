import type { BuildingForScene } from "../mutation/building";
import type { ClusterIndexEntry } from "../model/types";
import type { AgentGraphData } from "../sim/agentGraph";
import type { RoutableEdge } from "../traffic/routableGraph";
import type { ODNodeFlow } from "../traffic/assignment";

// One drivable street centerline, deduped from the directed road graph.
export type StreetSegment = {
  path: [number, number][]; // ENU [east, north] polyline
  lanes: number;
  roadClass: string;
  congestion: number; // 0..1 max v/c across the segment's directions (flow field)
};

// Everything the client needs to re-solve the flow in the browser when the city is
// edited (5e). Slim by design: the routable edges drop their geometry (the solver
// never reads it), and the cluster->node and street/agent->edge maps are precomputed
// server-side so an edit is one cheap solve, no network round-trip.
export type ReactiveFlowInputs = {
  edges: Omit<RoutableEdge, "geometry">[]; // routable edges, no geometry
  baseOD: ODNodeFlow[]; // cordon through-traffic scenario, node-level
  gatewayNodeIds: string[]; // cordon connector nodes demand spreads to/from
  streetEdgeIds: string[][]; // per street (streets order): contributing edge ids
  agentEdgeIds: string[]; // per agent edge (network.edges order): edge id
  clusterNodeId: Record<string, string>; // cluster -> nearest road node id
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
  reactive: ReactiveFlowInputs; // inputs to re-solve flow on edits (5e)
  originLatLon: [number, number]; // stored [lon, lat] (loader convention)
  metresPerStorey: number;
};

export type ModelBounds = {
  center: [number, number]; // ENU [east, north] metres
  radius: number; // half the larger extent, metres
};
