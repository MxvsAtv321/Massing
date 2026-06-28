// Uniform per-consequence confidence (I3b, ADR-R26). Every score the agent reads carries a confidence
// of the same shape, so the agent and the UI weigh a low-confidence number the same way regardless of
// which consequence it is. The class and note are computed per consequence from the inputs that drove
// it: sun from the shadow ledger (I3a), reach from coverage, population by the greenfield construction,
// traffic from the standing demand assumption.

export type ConfidenceClass = "high" | "medium" | "low";

export type ScoreConfidence = {
  class: ConfidenceClass;
  note: string;
};

// Population on a greenfield (clear-and-generate, ADR-R19) district is the proposal's own chosen
// heights, so it is high confidence by construction and never inherits real-data height uncertainty.
// Scoped explicitly to greenfield (ADR-R26): a future retain-existing mode must not reuse this.
export function greenfieldPopulationConfidence(): ScoreConfidence {
  return {
    class: "high",
    note: "greenfield: population is the proposal's own chosen heights, not measured data",
  };
}

// Reachability confidence from how many homes reach the park, plus the catchment coverage. A partial
// catchment (the real road network split, scoped to the dominant component, ADR-R25) caps the class and
// says so, because an isochrone on a graph that silently dropped part of the neighborhood is exactly the
// confident wrong answer the project refuses.
export function reachConfidence(
  reachedFraction: number,
  coverage: "full" | "partial" = "full"
): ScoreConfidence {
  let cls: ConfidenceClass =
    reachedFraction >= 0.95 ? "high" : reachedFraction >= 0.7 ? "medium" : "low";
  if (coverage === "partial" && cls === "high") cls = "medium";
  const coverageNote =
    coverage === "partial"
      ? "; isochrone scoped to the dominant road component, part of the catchment is not represented"
      : "";
  return {
    class: cls,
    note: `${(reachedFraction * 100).toFixed(0)}% of homes reach the park${coverageNote}`,
  };
}

// Traffic rests on an assumed demand scenario, not a prediction (ADR-R13), so its confidence is low by
// nature and independent of the geometry. The note carries the assumption.
export function demandConditionalConfidence(note: string): ScoreConfidence {
  return { class: "low", note };
}

// Sun confidence from the shadow ledger's risk fraction (I3a): the share of the region's lost sun cast
// by estimated-height occluders. The class is the ledger's; this only attaches the uniform note.
export function sunConfidenceLabel(
  cls: ConfidenceClass,
  shadowRiskFraction: number,
  lostHours: number
): ScoreConfidence {
  return {
    class: cls,
    note: `${(shadowRiskFraction * 100).toFixed(0)}% of the lost sun is cast by estimated-height occluders (${lostHours.toFixed(1)}h lost)`,
  };
}
