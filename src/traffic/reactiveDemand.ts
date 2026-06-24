import type { ODNodeFlow } from "./assignment";

// Reactive demand: couple building height edits to traffic. A taller building
// generates more trips (floor area grows with height), injected as origin-destination
// demand between the building's nearest road node and the cordon gateways, so raising
// a building loads its access roads and the corridors that reach the boundary.
//
// This is simulated flow, not a prediction. The rebuild (ADR-R07) lifted the old
// no-buildings-to-demand honesty constraint; flow is explicitly the simulated world,
// invented freely. Pure, no I/O.

// Trips per hour generated per added storey. Tunable: sized so a few extra storeys
// make a visible dent against the cordon scenario (whose pairs are ~500-800 trips).
export const TRIPS_PER_STOREY = 50;

// Delta trips from a height edit: proportional to the change in storeys (the rep
// height times (ratio - 1)). Only positive deltas inject load; lowering a building
// below its real height has nothing to remove, since the baseline carries no
// per-building trips (raising is the interaction that drives the loop).
export function clusterDeltaTrips(
  repHeightMetres: number,
  ratio: number,
  metresPerStorey: number
): number {
  if (metresPerStorey <= 0) return 0;
  const deltaStoreys = (repHeightMetres * (ratio - 1)) / metresPerStorey;
  return Math.max(0, deltaStoreys * TRIPS_PER_STOREY);
}

// Spread a building's trips evenly to and from every cordon gateway: outbound
// (building -> gateway) and inbound (gateway -> building), so the node both generates
// and attracts in balance. Shortest-time routing concentrates the load on the
// building's real access roads regardless of which gateway each trip targets.
export function buildingDemandFlows(
  buildingNodeId: string,
  deltaTrips: number,
  gatewayNodeIds: string[]
): ODNodeFlow[] {
  if (deltaTrips <= 0 || gatewayNodeIds.length === 0) return [];
  const per = deltaTrips / gatewayNodeIds.length;
  if (per <= 0) return [];
  const flows: ODNodeFlow[] = [];
  for (const g of gatewayNodeIds) {
    if (g === buildingNodeId) continue;
    flows.push({ fromNodeId: buildingNodeId, toNodeId: g, tripsPerHour: per });
    flows.push({ fromNodeId: g, toNodeId: buildingNodeId, tripsPerHour: per });
  }
  return flows;
}

// Combine the baseline cordon OD with all edited buildings' demand for a re-solve.
export function combineDemand(
  baseOD: ODNodeFlow[],
  buildingFlows: ODNodeFlow[]
): ODNodeFlow[] {
  return buildingFlows.length === 0 ? baseOD : [...baseOD, ...buildingFlows];
}
