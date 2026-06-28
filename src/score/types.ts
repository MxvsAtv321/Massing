// The score surface the agent reads (G4, ADR-R20). Four scores, four bases. The basis is a literal
// discriminant so the agent's tool schema (G5) cannot present the demand-conditional traffic score as
// the same kind of fact as the geometry-derived ones, which is how the agent's self-critique stays
// honest. The three geometry scores are as solid as the determinism gate makes them; traffic rests on
// an assumed demand scenario (ADR-R13), never a prediction.

import type { SunConfidence } from "../study/shadowLedger";

export type ScoreBasis = "geometry" | "demand-conditional";

export type SunScore = {
  basis: "geometry";
  meanSunHours: number;
  sunlitFraction: number;
  windowHours: number;
  // The sun number's confidence, propagated to the occluders that actually shadowed this region (I3a,
  // ADR-R26): low when guessed-height towers cast the shadow, high when measured or generated ones do.
  confidence: SunConfidence;
};

export type UnitScore = {
  basis: "geometry";
  achievedUnits: number;
  requestedUnits: number;
  shortfall: number;
  population: number;
};

export type ReachScore = {
  basis: "geometry";
  reachedFraction: number;
  worstCaseMinutes: number;
  unreachableCount: number;
  withinMinutes: number;
};

export type TrafficScore = {
  basis: "demand-conditional";
  maxVC: number;
  congestedFraction: number;
  assumedDemandNote: string;
};

export type DistrictScores = {
  sun: SunScore;
  units: UnitScore;
  reach: ReachScore;
  traffic: TrafficScore;
};
