// What this tool refuses to model, framed as a feature not a limitation.
export const DO_NOT_MEASURE_BEHAVIORAL: readonly { label: string; reason: string }[] = [
  {
    label: "Induced travel demand",
    reason: "We never predict the trips a development generates. Traffic demand is a scenario you set, not a model output.",
  },
  {
    label: "Displacement",
    reason: "Displacement depends on tenure, income, and market dynamics, not massing.",
  },
  {
    label: "Property value change",
    reason: "Values reflect speculation, policy, and demand, none of which geometry predicts.",
  },
  {
    label: "Human movement",
    reason: "Pedestrian and activity patterns require simulation or survey data.",
  },
];

// Disclosed v1 simplifications, also part of the honesty brand.
export const DO_NOT_MEASURE_SIMPLIFICATIONS: readonly { label: string; reason: string }[] = [
  {
    label: "Terrain and ground slope",
    reason: "v1 uses a flat ground plane (ADR-002). Shadows on real slopes will differ.",
  },
  {
    label: "Footprint and position error",
    reason: "Horizontal position uncertainty in the massing data is not included in the band.",
  },
  {
    label: "Storey-to-metre assumption",
    reason: "Added buildings use 3 m/storey. Actual floor heights vary by use and era.",
  },
  {
    label: "Building fragmentation",
    reason: "Podium and shaft polygons are separate; shadows are per-polygon, not per-cluster.",
  },
];
