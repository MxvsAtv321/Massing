import type { RoadClass } from "../network/types";
import type { RoutableEdge, RoutableGraph } from "./routableGraph";
import { shortestPathTree } from "../network/shortestPath";

// Incremental static traffic assignment with a BPR volume-delay function. Pure, no I/O,
// no dependency on buildings or demand prediction: it consumes a routable graph and the
// user's origin-destination flows and returns physics (per-edge volumes and speeds).
// Flow is scenario-conditional, never a prediction of demand (ADR-006, ADR-009).

export type ODNodeFlow = { fromNodeId: string; toNodeId: string; tripsPerHour: number };

// Nominal per-lane capacity (veh/hour/lane) by road class. The band ensemble perturbs
// these, more where the lane count was OSM-defaulted.
export const DEFAULT_PER_LANE_CAP: Record<RoadClass, number> = {
  motorway: 1800,
  trunk: 1400,
  primary: 1000,
  secondary: 800,
  tertiary: 700,
  residential: 500,
  living_street: 300,
  unclassified: 600,
};

export type AssignParams = {
  increments: number;
  bprAlpha: number;
  bprBeta: number;
  capScale: number;
  perLaneCap: Record<RoadClass, number>;
};

export const DEFAULT_ASSIGN_PARAMS: AssignParams = {
  increments: 6,
  bprAlpha: 0.15,
  bprBeta: 4,
  capScale: 1,
  perLaneCap: DEFAULT_PER_LANE_CAP,
};

export type EnsembleConfig = {
  samples: number;
  seed: number;
  sigmaBase: number; // lognormal sigma on capacity for well-tagged edges
  sigmaDefaulted: number; // wider sigma where the lane count was defaulted
};

export const DEFAULT_ENSEMBLE: EnsembleConfig = {
  samples: 8,
  seed: 0x9e3779b9,
  sigmaBase: 0.15,
  sigmaDefaulted: 0.35,
};

export const FLOW_SCOPE_NOTE =
  "Simulated flow under the demand you set. Band reflects capacity uncertainty " +
  "(wider where lane counts were defaulted); route choice assumed shortest-time; " +
  "not validated against real counts.";

// ---------------------------------------------------------------------------
// Per-edge physics
// ---------------------------------------------------------------------------

export function freeFlowTimeSec(edge: RoutableEdge): number {
  const speed = Math.max(5, edge.speedLimitKph); // floor avoids absurd times on a bad tag
  return edge.lengthMetres / (speed / 3.6);
}

// Per-direction lanes: a oneway uses all its lanes; a two-way splits them.
export function directedLanes(edge: RoutableEdge): number {
  return edge.oneway ? Math.max(1, edge.lanes) : Math.max(1, Math.round(edge.lanes / 2));
}

export function edgeCapacity(
  edge: RoutableEdge,
  params: AssignParams,
  capFactor = 1
): number {
  return directedLanes(edge) * params.perLaneCap[edge.roadClass] * params.capScale * capFactor;
}

export function bprTime(
  t0: number,
  volume: number,
  capacity: number,
  alpha: number,
  beta: number
): number {
  if (capacity <= 0) return t0 * (1 + alpha);
  return t0 * (1 + alpha * Math.pow(volume / capacity, beta));
}

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic band)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box-Muller.
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// One incremental assignment at a fixed capacity setting.
// Returns per-edge-index volume (veh/hour) and any OD pairs with no path.
// ---------------------------------------------------------------------------

export type AssignOnceResult = { volume: number[]; unroutable: ODNodeFlow[] };

export function assignOnce(
  graph: RoutableGraph,
  od: ODNodeFlow[],
  params: AssignParams,
  capFactors?: number[]
): AssignOnceResult {
  const { edges, adjacency } = graph;
  const n = edges.length;
  const t0 = edges.map(freeFlowTimeSec);
  const cap = edges.map((e, i) => edgeCapacity(e, params, capFactors ? capFactors[i] : 1));
  const volume = new Array<number>(n).fill(0);
  const time = t0.slice();
  const unroutable: ODNodeFlow[] = [];

  const byOrigin = new Map<string, ODNodeFlow[]>();
  for (const f of od) {
    if (f.tripsPerHour <= 0 || f.fromNodeId === f.toNodeId) continue;
    const list = byOrigin.get(f.fromNodeId);
    if (list) list.push(f);
    else byOrigin.set(f.fromNodeId, [f]);
  }

  const K = Math.max(1, Math.floor(params.increments));
  const frac = 1 / K;

  for (let k = 0; k < K; k++) {
    for (const [origin, flows] of byOrigin) {
      const { dist, predEdge } = shortestPathTree(edges, adjacency, origin, (ei) => time[ei]);
      for (const f of flows) {
        if (!dist.has(f.toNodeId)) {
          if (k === 0) unroutable.push(f);
          continue;
        }
        const add = frac * f.tripsPerHour;
        let cur = f.toNodeId;
        // Walk the predecessor chain back to the origin, loading each edge.
        while (cur !== origin) {
          const ei = predEdge.get(cur);
          if (ei === undefined) break;
          volume[ei] += add;
          cur = edges[ei].from;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      time[i] = bprTime(t0[i], volume[i], cap[i], params.bprAlpha, params.bprBeta);
    }
  }

  return { volume, unroutable };
}

// ---------------------------------------------------------------------------
// Assignment with a capacity-uncertainty band (Monte Carlo ensemble).
// ---------------------------------------------------------------------------

export type EdgeFlow = {
  edgeId: string;
  volumeMid: number;
  volumeLow: number;
  volumeHigh: number;
  vcMid: number; // volume / capacity at nominal capacity
  vcLow: number;
  vcHigh: number;
  speedMidKph: number;
  speedLowKph: number; // slowest across the ensemble (lowest capacity)
  speedHighKph: number;
  bandWidthRel: number; // (vcHigh - vcLow) / vcMid, drives the uncertainty fade in the overlay
};

export type FlowResult = {
  perEdge: Map<string, EdgeFlow>;
  totalVehKmLow: number;
  totalVehKmMid: number;
  totalVehKmHigh: number;
  congestedEdges: number; // mid v/c > 0.9
  maxVOverC: number;
  unroutable: { fromNodeId: string; toNodeId: string }[];
  scopeNote: string;
};

function congestedSpeedKph(
  edge: RoutableEdge,
  t0: number,
  volume: number,
  capacity: number,
  params: AssignParams
): number {
  const t = bprTime(t0, volume, capacity, params.bprAlpha, params.bprBeta);
  return t > 0 ? (edge.lengthMetres / t) * 3.6 : edge.speedLimitKph;
}

// The band is dominated by capacity uncertainty acting directly on v/c and speed (every
// loaded edge's congestion is uncertain because its capacity is), with a secondary effect
// from route choice shifting volumes. The mid is the nominal-capacity run; each ensemble
// member perturbs per-edge capacity (wider where lanes were defaulted) and the band is the
// min/max of v/c, speed, and volume across the ensemble.
export function assignWithBand(
  graph: RoutableGraph,
  od: ODNodeFlow[],
  baseParams: AssignParams = DEFAULT_ASSIGN_PARAMS,
  ensemble: EnsembleConfig = DEFAULT_ENSEMBLE
): FlowResult {
  const { edges } = graph;
  const n = edges.length;
  const km = edges.map((e) => e.lengthMetres / 1000);
  const t0 = edges.map(freeFlowTimeSec);
  const capMid = edges.map((e) => edgeCapacity(e, baseParams, 1));

  const vcAt = (vol: number, cap: number) => (cap > 0 ? vol / cap : 0);

  // Nominal run is the mid; bands are initialised to it so low <= mid <= high holds.
  const nominal = assignOnce(graph, od, baseParams);
  const volMid = nominal.volume;
  const vcMid = edges.map((_, i) => vcAt(volMid[i], capMid[i]));
  const speedMid = edges.map((e, i) => congestedSpeedKph(e, t0[i], volMid[i], capMid[i], baseParams));

  const volLow = volMid.slice();
  const volHigh = volMid.slice();
  const vcLow = vcMid.slice();
  const vcHigh = vcMid.slice();
  const speedLow = speedMid.slice();
  const speedHigh = speedMid.slice();

  const totalMidVehKm = volMid.reduce((s, v, i) => s + v * km[i], 0);
  let totalLowVehKm = totalMidVehKm;
  let totalHighVehKm = totalMidVehKm;

  const rng = mulberry32(ensemble.seed);
  for (let s = 0; s < ensemble.samples; s++) {
    const capFactors = edges.map((e) => {
      const sigma = e.defaultedLanes ? ensemble.sigmaDefaulted : ensemble.sigmaBase;
      return Math.exp(gaussian(rng) * sigma);
    });
    const run = assignOnce(graph, od, baseParams, capFactors);
    let runTotal = 0;
    for (let i = 0; i < n; i++) {
      const v = run.volume[i];
      const capS = capMid[i] * capFactors[i];
      const vcS = vcAt(v, capS);
      const spS = congestedSpeedKph(edges[i], t0[i], v, capS, baseParams);
      if (v < volLow[i]) volLow[i] = v;
      if (v > volHigh[i]) volHigh[i] = v;
      if (vcS < vcLow[i]) vcLow[i] = vcS;
      if (vcS > vcHigh[i]) vcHigh[i] = vcS;
      if (spS < speedLow[i]) speedLow[i] = spS;
      if (spS > speedHigh[i]) speedHigh[i] = spS;
      runTotal += v * km[i];
    }
    if (runTotal < totalLowVehKm) totalLowVehKm = runTotal;
    if (runTotal > totalHighVehKm) totalHighVehKm = runTotal;
  }

  const perEdge = new Map<string, EdgeFlow>();
  let congestedEdges = 0;
  let maxVOverC = 0;

  for (let i = 0; i < n; i++) {
    const e = edges[i];
    const bandWidthRel = vcMid[i] > 0.01 ? (vcHigh[i] - vcLow[i]) / vcMid[i] : 0;
    perEdge.set(e.id, {
      edgeId: e.id,
      volumeMid: volMid[i],
      volumeLow: volLow[i],
      volumeHigh: volHigh[i],
      vcMid: vcMid[i],
      vcLow: vcLow[i],
      vcHigh: vcHigh[i],
      speedMidKph: speedMid[i],
      speedLowKph: speedLow[i],
      speedHighKph: speedHigh[i],
      bandWidthRel,
    });
    if (vcMid[i] > 0.9) congestedEdges++;
    if (vcMid[i] > maxVOverC) maxVOverC = vcMid[i];
  }

  return {
    perEdge,
    totalVehKmLow: totalLowVehKm,
    totalVehKmMid: totalMidVehKm,
    totalVehKmHigh: totalHighVehKm,
    congestedEdges,
    maxVOverC,
    unroutable: nominal.unroutable.map((f) => ({ fromNodeId: f.fromNodeId, toNodeId: f.toNodeId })),
    scopeNote: FLOW_SCOPE_NOTE,
  };
}
