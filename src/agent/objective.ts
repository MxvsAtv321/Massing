// The multi-objective vector and its evaluation (G6). Unlike G5's single scalar, a vector has no
// single "closer", and the objectives are in genuine tension (more people means taller towers means
// less park sun). So the model is not all-or-nothing: an objective is met or traded, and a traded
// objective carries its shortfall, the same achieved-versus-requested honesty as FillResult. The agent
// converges on the best balance it can reach and states the trades it made. Only geometry-derived
// objectives are scored here; car-free and step-down are true by construction and never appear (they
// cannot be traded away). Pure, THREE-free, unit-tested.

export type Objective =
  | { kind: "population"; target: number; tolFrac: number } // within a band of the target
  | { kind: "parkSunHours"; floor: number } // at or above a sun-hours floor
  | { kind: "parkReachMinutes"; ceiling: number }; // at or under a walk-minutes ceiling

export type ObjectiveValues = {
  population: number;
  parkSunHours: number;
  parkReachMinutes: number;
};

export type ObjectiveResult = {
  kind: Objective["kind"];
  met: boolean;
  value: number;
  desc: string; // human-readable, for the agent's presentation
  shortfall: number; // signed miss in the objective's own units (0 if met)
  shortfallFrac: number; // normalized miss, for comparing configurations across units
};

export type VectorEvaluation = { results: ObjectiveResult[]; allMet: boolean };

export function evaluateVector(values: ObjectiveValues, vector: Objective[]): VectorEvaluation {
  const results = vector.map((o): ObjectiveResult => {
    if (o.kind === "population") {
      const met = Math.abs(values.population - o.target) <= o.target * o.tolFrac;
      const shortfall = met ? 0 : o.target - values.population; // positive: under target
      return {
        kind: o.kind,
        met,
        value: values.population,
        desc: `population ${Math.round(values.population)} vs target ${o.target}`,
        shortfall,
        shortfallFrac: met ? 0 : Math.abs(shortfall) / o.target,
      };
    }
    if (o.kind === "parkSunHours") {
      const met = values.parkSunHours >= o.floor;
      const shortfall = met ? 0 : o.floor - values.parkSunHours; // positive: under floor
      return {
        kind: o.kind,
        met,
        value: values.parkSunHours,
        desc: `park sun ${values.parkSunHours.toFixed(1)}h vs floor ${o.floor}h`,
        shortfall,
        shortfallFrac: met ? 0 : Math.abs(shortfall) / o.floor,
      };
    }
    const met = values.parkReachMinutes <= o.ceiling;
    const shortfall = met ? 0 : values.parkReachMinutes - o.ceiling; // positive: over ceiling
    return {
      kind: o.kind,
      met,
      value: values.parkReachMinutes,
      desc: `park reach ${values.parkReachMinutes.toFixed(1)}min vs ${o.ceiling}min`,
      shortfall,
      shortfallFrac: met ? 0 : Math.abs(shortfall) / o.ceiling,
    };
  });
  return { results, allMet: results.every((r) => r.met) };
}

// A configuration is better if it meets more objectives, then if its total normalized shortfall is
// smaller. The loop tracks the best to detect when the agent can no longer improve (the traded point).
export function satisfaction(ev: VectorEvaluation): { metCount: number; totalShortfallFrac: number } {
  let metCount = 0;
  let totalShortfallFrac = 0;
  for (const r of ev.results) {
    if (r.met) metCount++;
    else totalShortfallFrac += r.shortfallFrac;
  }
  return { metCount, totalShortfallFrac };
}

export function isBetter(
  a: { metCount: number; totalShortfallFrac: number },
  b: { metCount: number; totalShortfallFrac: number }
): boolean {
  if (a.metCount !== b.metCount) return a.metCount > b.metCount;
  return a.totalShortfallFrac < b.totalShortfallFrac - 1e-9;
}
