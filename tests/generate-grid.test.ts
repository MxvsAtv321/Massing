import { describe, it, expect } from "vitest";
import { buildGrid, gridNodeEnu, gridCellCenterEnu } from "../src/generate/grid";
import type { ResolvedRegion } from "../src/generate/reference";

// A 200x200 region centered at the origin, axis-aligned.
const REGION: ResolvedRegion = {
  ring: [[-100, -100], [100, -100], [100, 100], [-100, 100]],
  center: [0, 0],
};

// ─── buildGrid ──────────────────────────────────────────────────────────────────

describe("buildGrid", () => {
  it("sizes the lattice from the region bounds and cell size", () => {
    const g = buildGrid(REGION, 0, 100);
    expect(g.cols).toBe(2);
    expect(g.rows).toBe(2);
    expect(g.cellSize).toBe(100);
    expect(g.u0).toBe(-100);
    expect(g.v0).toBe(-100);
  });

  it("places the corner node and steps by cell size when axis-aligned", () => {
    const g = buildGrid(REGION, 0, 100);
    expect(gridNodeEnu(g, 0, 0)).toEqual([-100, -100]);
    expect(gridNodeEnu(g, 2, 2)).toEqual([100, 100]);
    expect(gridNodeEnu(g, 1, 0)).toEqual([0, -100]);
  });

  it("stores the axis cos/sin once and rotates node positions by them", () => {
    const g = buildGrid(REGION, Math.PI / 2, 100);
    expect(g.cos).toBeCloseTo(0, 12);
    expect(g.sin).toBeCloseTo(1, 12);
    // Corner (0,0) at axis (-100,-100) rotated +90 deg maps to (+100,-100).
    const [e, n] = gridNodeEnu(g, 0, 0);
    expect(e).toBeCloseTo(100, 6);
    expect(n).toBeCloseTo(-100, 6);
  });

  it("is deterministic for the same inputs", () => {
    expect(buildGrid(REGION, 0.7, 80)).toEqual(buildGrid(REGION, 0.7, 80));
  });

  it("places cell centers half a cell in from the corner", () => {
    const g = buildGrid(REGION, 0, 100);
    expect(gridCellCenterEnu(g, 0, 0)).toEqual([-50, -50]);
    expect(gridCellCenterEnu(g, 1, 1)).toEqual([50, 50]);
  });
});
