// Pure height-edit math, shared by the gizmo and its tests. A height edit is a
// Y-scale ratio against the cluster's representative height; these convert between
// the gizmo's continuous scale and whole storeys and clamp to the legal range.
// The storey bounds mirror the EditOp schema (editOp.ts: heightStoreys 1..120) and
// must stay in sync with it.
export const MIN_STOREYS = 1;
export const MAX_STOREYS = 120;

export function clampStoreys(storeys: number): number {
  return Math.max(MIN_STOREYS, Math.min(MAX_STOREYS, Math.round(storeys)));
}

export function ratioToStoreys(ratio: number, repHeight: number, mps: number): number {
  if (mps <= 0) return 0;
  return (ratio * repHeight) / mps;
}

export function storeysToRatio(storeys: number, repHeight: number, mps: number): number {
  if (repHeight <= 0) return 1;
  return (storeys * mps) / repHeight;
}

// Clamp the live drag ratio to the [1, 120] storey range, continuously (no
// rounding) so the drag feels smooth right up to the limits.
export function clampRatio(ratio: number, repHeight: number, mps: number): number {
  const lo = storeysToRatio(MIN_STOREYS, repHeight, mps);
  const hi = storeysToRatio(MAX_STOREYS, repHeight, mps);
  return Math.max(lo, Math.min(hi, ratio));
}

// The committed Y-scale ratio for a cluster given its edited representative
// height in metres. This is exactly newRep / oldRep, so the matrix the renderer
// applies matches the overlay's stored height.
export function committedRatio(newRepMetres: number, repHeight: number): number {
  return repHeight > 0 ? newRepMetres / repHeight : 1;
}
