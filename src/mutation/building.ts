// Relocated from the demolished src/scene/buildings.ts in Unit 0 so the kept
// mutation layer compiles without the old presentation layer.
//
// TODO(unit4): rework to a grounded/simulated register per ADR-R07. The
// `confidenceKind` field is honesty-era residue; the rebuilt product
// distinguishes grounded real geometry from simulated/hypothetical additions,
// not measured/estimated/hypothetical confidence tiers.
import type { Footprint } from "../model/types";

// Readonly geometry (footprint, heightValue) so the visual layer cannot mutate what the scorers and the
// signature read; this is the type-level half of the appearance-not-identity wall (ADR-R29).
export type BuildingForScene = {
  readonly id: string;
  readonly footprint: Footprint; // rings of [east, north] ENU metres
  readonly heightValue: number;
  readonly clusterId: string;
  readonly confidenceKind: "measured" | "estimated" | "hypothetical";
};
