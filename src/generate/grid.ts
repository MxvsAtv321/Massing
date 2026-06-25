import type { ResolvedRegion } from "./reference";

// The street grid: a regular lattice oriented to the district's primary axis, the deterministic
// skeleton the blocks and lots hang off (ADR-R18). The axis rotation's cos and sin are computed ONCE
// in buildGrid and reused for every node, so the geometry hot path carries no per-vertex
// transcendental (the determinism gate, ADR-R23): a sin or cos per vertex is at the mercy of the
// platform libm and is the silent way node and a browser engine diverge. Everything below is
// multiply and add. ENU [east, north] metres throughout.

export type Grid = {
  axisRad: number;
  cos: number; // cos(axisRad), computed once
  sin: number; // sin(axisRad), computed once
  center: [number, number]; // ENU rotation pivot (the region center)
  u0: number; // axis-frame min along-axis coordinate
  v0: number; // axis-frame min cross-axis coordinate
  cols: number; // cells along the axis
  rows: number; // cells across the axis
  cellSize: number; // metres
};

// Map an axis-frame point (uu along axis, vv across) to ENU using the once-computed cos/sin. Exported
// so lots and massing reuse this exact mapping rather than calling trig per vertex (the determinism
// principle, ADR-R23): all callers share the one cos/sin pair stored on the grid.
export function axisToEnu(grid: Grid, uu: number, vv: number): [number, number] {
  return [
    grid.center[0] + uu * grid.cos - vv * grid.sin,
    grid.center[1] + uu * grid.sin + vv * grid.cos,
  ];
}

// ENU position of grid intersection (i, j); i in 0..cols, j in 0..rows.
export function gridNodeEnu(grid: Grid, i: number, j: number): [number, number] {
  return axisToEnu(grid, grid.u0 + i * grid.cellSize, grid.v0 + j * grid.cellSize);
}

// ENU center of cell (i, j); i in 0..cols-1, j in 0..rows-1.
export function gridCellCenterEnu(grid: Grid, i: number, j: number): [number, number] {
  return axisToEnu(
    grid,
    grid.u0 + (i + 0.5) * grid.cellSize,
    grid.v0 + (j + 0.5) * grid.cellSize
  );
}

export function buildGrid(
  region: ResolvedRegion,
  axisRad: number,
  cellSize: number
): Grid {
  // The only transcendentals in the grid path, computed once and then reused everywhere.
  const cos = Math.cos(axisRad);
  const sin = Math.sin(axisRad);
  const [cx, cy] = region.center;

  // Project the region ring into the axis frame (rotate by -axisRad about the center) to get the
  // along/across bounds. cos(-t) = cos, sin(-t) = -sin, so the same pair is reused, no new trig.
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const [e, n] of region.ring) {
    const de = e - cx;
    const dn = n - cy;
    const uu = de * cos + dn * sin;
    const vv = -de * sin + dn * cos;
    if (uu < uMin) uMin = uu;
    if (uu > uMax) uMax = uu;
    if (vv < vMin) vMin = vv;
    if (vv > vMax) vMax = vv;
  }

  const cols = Math.max(1, Math.ceil((uMax - uMin) / cellSize));
  const rows = Math.max(1, Math.ceil((vMax - vMin) / cellSize));

  return { axisRad, cos, sin, center: [cx, cy], u0: uMin, v0: vMin, cols, rows, cellSize };
}
