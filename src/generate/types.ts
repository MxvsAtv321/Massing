import type { GenerativeOp } from "./op";
import type { RegionRef, RefContext } from "./reference";

// The materialized state of one generated district in the overlay (ADR-R19). Created by a
// DefineDistrict op; shaping ops append to `ops` in order. G1 fills the expanded geometry; G0
// declares the slots so the contracts are explicit before the expander hardcodes them. Type-only,
// so the mutation overlay can carry a GeneratedDistrict without a runtime dependency on src/generate.

// The precedence the FillBlocks expander must honor (ADR-R20), encoded as a value so it cannot be
// silently re-decided in G1: the target is the goal, the height envelope and coverage are hard
// constraints, and an infeasible target fills to the envelope and reports a shortfall.
export const FILL_PRECEDENCE = {
  goal: "target",
  hardConstraints: ["heightEnvelope", "coverage"],
  onInfeasible: "fill-to-envelope-and-report-shortfall",
} as const;

// Achieved-versus-requested for one FillBlocks expansion. The shortfall is not an error, it is the
// signal the agent reads in its scoring loop ("you asked for 2000, the envelope allows 1400"). G1
// computes it; declared here so the result slot exists from the schema unit.
export type FillResult = {
  requestedUnits: number; // target normalized to dwelling or job units
  achievedUnits: number; // what the envelope and coverage actually allowed
  shortfall: number; // max(0, requestedUnits - achievedUnits); 0 means the target was met
  metTarget: boolean;
  buildingCount: number;
};

export type GeneratedDistrict = {
  id: string;
  seed: number;
  region: RegionRef; // the DefineDistrict region, kept for deterministic re-resolution
  ops: GenerativeOp[]; // ordered shaping ops; order is part of the determinism contract (ADR-R23)
  clearedClusterIds: string[]; // real clusters this district newly removed (sorted, reversible)
  // G1 fills these. Declared now so the precedence and result contracts are explicit.
  fillResults?: FillResult[];
  // massing, streets, and walkGraph slots land in G1.
};

// Everything a generative op resolves against. Extends the reference fixtures with the real cluster
// centroids the canvas clearing tests (ADR-R19). G1 fills it from the build payload.
export type GenerativeContext = RefContext & {
  clusterCentroids: Record<string, [number, number]>; // cluster id -> ENU [east, north]
};
