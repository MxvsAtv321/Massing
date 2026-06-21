// Relocated from the demolished src/scene/buildings.ts in Unit 0 so the kept
// mutation layer compiles without the old presentation layer.
//
// TODO(unit4): rework to a grounded/simulated register per ADR-R07. The
// `confidenceKind` field is honesty-era residue; the rebuilt product
// distinguishes grounded real geometry from simulated/hypothetical additions,
// not measured/estimated/hypothetical confidence tiers.
export type BuildingForScene = {
  id: string;
  footprint: number[][][]; // rings of [east, north] ENU metres
  heightValue: number;
  clusterId: string;
  confidenceKind: "measured" | "estimated" | "hypothetical";
};
