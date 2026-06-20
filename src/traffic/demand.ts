// Demand model for the traffic wind tunnel. Pure, no I/O, no dependency on the massing
// or edit layers: there is no code path from buildings to demand. Demand is always a
// user-set scenario, an assumption, never a prediction (ADR-006, ADR-008).

export type CordonSide = "N" | "E" | "S" | "W";

// A resolved cordon gateway: a boundary arterial crossing snapped to a network node.
export type Place = {
  id: string;
  label: string;
  side: CordonSide;
  centroidEnu: [number, number]; // the connector node's ENU position
  connectorNodeId: string; // SCC node Part 3 will route from/to
};

// One origin-destination flow: how many trips per hour the user assumes want to go
// from one gateway to another. The number is the user's; we never compute it.
export type ODFlow = {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  tripsPerHour: number;
};

export type DemandProvenance = {
  kind: "user-scenario";
  note: string;
  setDate: string; // ISO date the scenario was set
};

export type DemandScenario = {
  flows: ODFlow[];
  provenance: DemandProvenance;
};

export const MAX_TRIPS_PER_HOUR = 5000;

export function userScenarioProvenance(
  setDate: string,
  note = "Demand set by the user, an assumption, not a prediction."
): DemandProvenance {
  return { kind: "user-scenario", note, setDate };
}

// ---------------------------------------------------------------------------
// Validation: bounded, non-negative, whole trips between two distinct known places.
// ---------------------------------------------------------------------------

export type FlowValidation = { ok: true } | { ok: false; reason: string };

export function validateFlow(
  flow: { fromPlaceId: string; toPlaceId: string; tripsPerHour: number },
  placeIds: Set<string>
): FlowValidation {
  if (!placeIds.has(flow.fromPlaceId))
    return { ok: false, reason: `unknown origin ${flow.fromPlaceId}` };
  if (!placeIds.has(flow.toPlaceId))
    return { ok: false, reason: `unknown destination ${flow.toPlaceId}` };
  if (flow.fromPlaceId === flow.toPlaceId)
    return { ok: false, reason: "origin and destination are the same gateway" };
  const t = flow.tripsPerHour;
  if (!Number.isFinite(t) || !Number.isInteger(t))
    return { ok: false, reason: "trips per hour must be a whole number" };
  if (t < 0) return { ok: false, reason: "trips per hour must be non-negative" };
  if (t > MAX_TRIPS_PER_HOUR)
    return { ok: false, reason: `trips per hour exceeds ${MAX_TRIPS_PER_HOUR}` };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Conservation: trips generated (leaving) vs attracted (arriving) per gateway. The
// grand totals are always equal (each flow adds to both); the informative property is
// per-place balance, the realistic cordon condition that what enters also leaves.
// ---------------------------------------------------------------------------

export type ConservationEntry = { placeId: string; generated: number; attracted: number };
export type Conservation = {
  perPlace: ConservationEntry[];
  totalTrips: number;
  balanced: boolean; // every gateway's inflow and outflow match within tolerance
};

const BALANCE_TOL_TRIPS = 1;

export function summariseConservation(places: Place[], flows: ODFlow[]): Conservation {
  const gen = new Map<string, number>();
  const att = new Map<string, number>();
  for (const p of places) {
    gen.set(p.id, 0);
    att.set(p.id, 0);
  }
  let totalTrips = 0;
  for (const f of flows) {
    gen.set(f.fromPlaceId, (gen.get(f.fromPlaceId) ?? 0) + f.tripsPerHour);
    att.set(f.toPlaceId, (att.get(f.toPlaceId) ?? 0) + f.tripsPerHour);
    totalTrips += f.tripsPerHour;
  }
  const perPlace = places.map((p) => ({
    placeId: p.id,
    generated: gen.get(p.id) ?? 0,
    attracted: att.get(p.id) ?? 0,
  }));
  const balanced = perPlace.every(
    (e) => Math.abs(e.generated - e.attracted) <= BALANCE_TOL_TRIPS
  );
  return { perPlace, totalTrips, balanced };
}

// ---------------------------------------------------------------------------
// Example scenario: a balanced peak through-traffic pattern across opposite sides, for
// the "load example" button. Symmetric pairs keep every gateway's inflow and outflow
// equal. Deterministic given the places order.
// ---------------------------------------------------------------------------

export function exampleScenario(places: Place[]): ODFlow[] {
  const bySide = (s: CordonSide) => places.filter((p) => p.side === s);
  const flows: ODFlow[] = [];
  const addPair = (a: Place, b: Place, trips: number) => {
    flows.push({ id: `f:${a.id}->${b.id}`, fromPlaceId: a.id, toPlaceId: b.id, tripsPerHour: trips });
    flows.push({ id: `f:${b.id}->${a.id}`, fromPlaceId: b.id, toPlaceId: a.id, tripsPerHour: trips });
  };

  const E = bySide("E");
  const W = bySide("W");
  const N = bySide("N");
  const S = bySide("S");

  const ew = Math.min(E.length, W.length);
  for (let i = 0; i < ew; i++) addPair(E[i], W[i], 800);

  const ns = Math.min(N.length, S.length);
  for (let i = 0; i < ns; i++) addPair(N[i], S[i], 500);

  return flows;
}
