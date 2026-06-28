// The score surface the agent reads (G4, ADR-R20). Four scores, four bases. The basis is a literal
// discriminant so the agent's tool schema (G5) cannot present the demand-conditional traffic score as
// the same kind of fact as the geometry-derived ones, which is how the agent's self-critique stays
// honest. The three geometry scores are as solid as the determinism gate makes them; traffic rests on
// an assumed demand scenario (ADR-R13), never a prediction.

import type { ScoreConfidence } from "./confidence";

export type ScoreBasis = "geometry" | "demand-conditional";

// Every score carries a uniform confidence (I3b, ADR-R26), propagated to the inputs that drove it: sun
// from the shadow ledger, reach from coverage, population by greenfield construction, traffic from the
// demand assumption. The agent and the UI read score.confidence the same way regardless of which one.

export type SunScore = {
  basis: "geometry";
  meanSunHours: number;
  sunlitFraction: number;
  windowHours: number;
  confidence: ScoreConfidence;
};

export type UnitScore = {
  basis: "geometry";
  achievedUnits: number;
  requestedUnits: number;
  shortfall: number;
  population: number;
  confidence: ScoreConfidence;
};

export type ReachScore = {
  basis: "geometry";
  reachedFraction: number;
  worstCaseMinutes: number;
  unreachableCount: number;
  withinMinutes: number;
  confidence: ScoreConfidence;
};

export type TrafficScore = {
  basis: "demand-conditional";
  maxVC: number;
  congestedFraction: number;
  assumedDemandNote: string;
  confidence: ScoreConfidence;
};

export type DistrictScores = {
  sun: SunScore;
  units: UnitScore;
  reach: ReachScore;
  traffic: TrafficScore;
};
