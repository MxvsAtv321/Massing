import { type Grid, gridNodeEnu, gridCellCenterEnu } from "./grid";
import { type ResolvedRegion, pointInRing } from "./reference";

// Partition the gridded district into blocks: the cells whose center falls inside the district
// region. Precise polygon clipping at the boundary is a later refinement; center-inclusion is the
// clean, deterministic G1 rule (ADR-R18). Pure, THREE-free. Block order is row-major, so it never
// depends on a Set's iteration order (the determinism gate, ADR-R23).

export type Block = {
  id: string; // `b:${i}:${j}`
  i: number;
  j: number;
  ring: [number, number][]; // ENU corners in axis order: (i,j) (i+1,j) (i+1,j+1) (i,j+1)
};

export function partitionBlocks(grid: Grid, region: ResolvedRegion): Block[] {
  const blocks: Block[] = [];
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const [ce, cn] = gridCellCenterEnu(grid, i, j);
      if (!pointInRing(region.ring, ce, cn)) continue;
      const ring: [number, number][] = [
        gridNodeEnu(grid, i, j),
        gridNodeEnu(grid, i + 1, j),
        gridNodeEnu(grid, i + 1, j + 1),
        gridNodeEnu(grid, i, j + 1),
      ];
      blocks.push({ id: `b:${i}:${j}`, i, j, ring });
    }
  }
  return blocks;
}
