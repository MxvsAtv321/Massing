import { describe, it, expect } from "vitest";
import { buildGrid } from "../src/generate/grid";
import { partitionBlocks } from "../src/generate/blocks";
import type { ResolvedRegion } from "../src/generate/reference";

const RECT: ResolvedRegion = {
  ring: [[-100, -100], [100, -100], [100, 100], [-100, 100]],
  center: [0, 0],
};

describe("partitionBlocks", () => {
  it("keeps every cell of a rect the grid exactly covers", () => {
    const grid = buildGrid(RECT, 0, 100);
    const blocks = partitionBlocks(grid, RECT);
    expect(blocks).toHaveLength(4); // 2x2
    expect(new Set(blocks.map((b) => b.id)).size).toBe(4); // ids unique
  });

  it("gives each block a four-corner ring aligned to the grid", () => {
    const grid = buildGrid(RECT, 0, 100);
    const blocks = partitionBlocks(grid, RECT);
    const b00 = blocks.find((b) => b.id === "b:0:0")!;
    expect(b00.ring).toEqual([
      [-100, -100],
      [0, -100],
      [0, 0],
      [-100, 0],
    ]);
  });

  it("emits blocks in row-major order (determinism, not Set order)", () => {
    const grid = buildGrid(RECT, 0, 100);
    const ids = partitionBlocks(grid, RECT).map((b) => b.id);
    expect(ids).toEqual(["b:0:0", "b:1:0", "b:0:1", "b:1:1"]);
    expect(partitionBlocks(grid, RECT)).toEqual(partitionBlocks(grid, RECT));
  });

  it("excludes cells whose center falls outside a smaller polygon region", () => {
    // A diamond inscribed in the rect: only the central cells' centers fall inside.
    const diamond: ResolvedRegion = {
      ring: [[0, -120], [120, 0], [0, 120], [-120, 0]],
      center: [0, 0],
    };
    const grid = buildGrid(diamond, 0, 60);
    const blocks = partitionBlocks(grid, diamond);
    // Some grid cells near the corners of the bounding box are outside the diamond.
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.length).toBeLessThan(grid.cols * grid.rows);
  });
});
