import type { ExpandedDistrict } from "../generate/expand";
import type { TrafficScore } from "./types";
import { solveFlowLite, type ODNodeFlow } from "../traffic/assignment";
import { buildAdjacency, type RoutableEdge, type RoutableGraph } from "../traffic/routableGraph";
import { clampCongestion } from "../render/flowField";

// Trips per resident in the peak hour. An ASSUMED scenario knob (ADR-R13), not a prediction, which is
// exactly why the traffic score is marked demand-conditional below.
export const TRIPS_PER_RESIDENT = 0.5;

export type TrafficInputs = {
  edges: Omit<RoutableEdge, "geometry">[]; // the routable network, geometry dropped (solver ignores it)
  baseOD: ODNodeFlow[]; // the cordon through-traffic scenario
  gatewayNodeIds: string[]; // boundary nodes the district demand spreads to and from
  districtNodeId: string; // the real road node the district loads
};

// Traffic load from the flow re-solve with the district's population folded into demand. DEMAND-
// CONDITIONAL (ADR-R13): the result rests on TRIPS_PER_RESIDENT, a scenario assumption, so the score
// carries basis "demand-conditional" and an explicit note, and the agent must consciously invoke this
// tool rather than receive it folded in with the geometry-derived facts. `population` comes from the
// unit score, so traffic and units read the same built city. Underscore-prefixed `_district` documents
// that the demand traces to the district whose units produced `population`.
export function trafficScore(
  _district: ExpandedDistrict,
  population: number,
  inputs: TrafficInputs
): TrafficScore {
  const edges: RoutableEdge[] = inputs.edges.map((e) => ({ ...e, geometry: [] as [number, number][] }));
  const graph: RoutableGraph = { nodes: [], edges, adjacency: buildAdjacency([], edges) };

  const trips = population * TRIPS_PER_RESIDENT;
  const per = inputs.gatewayNodeIds.length > 0 ? trips / inputs.gatewayNodeIds.length : 0;
  const districtFlows: ODNodeFlow[] = [];
  for (const g of inputs.gatewayNodeIds) {
    if (g === inputs.districtNodeId || per <= 0) continue;
    districtFlows.push({ fromNodeId: inputs.districtNodeId, toNodeId: g, tripsPerHour: per });
    districtFlows.push({ fromNodeId: g, toNodeId: inputs.districtNodeId, tripsPerHour: per });
  }

  const flow = solveFlowLite(graph, inputs.baseOD.concat(districtFlows));
  let maxVC = 0;
  let congested = 0;
  let count = 0;
  for (const e of edges) {
    const f = flow.get(e.id);
    if (!f) continue;
    count++;
    const vc = clampCongestion(f.vc);
    if (vc > maxVC) maxVC = vc;
    if (vc > 0.8) congested++;
  }

  return {
    basis: "demand-conditional",
    maxVC,
    congestedFraction: count === 0 ? 0 : congested / count,
    assumedDemandNote: `conditional on an assumed ${TRIPS_PER_RESIDENT} peak-hour trips per resident, a scenario knob, not a prediction (ADR-R13)`,
  };
}
