import { describe, it, expect } from "vitest";
import { buildGrid } from "../src/generate/grid";
import { partitionBlocks } from "../src/generate/blocks";
import { subdivideBlock } from "../src/generate/lots";
import { splitmix32 } from "../src/generate/rng";
import { pointInRing, type ResolvedRegion } from "../src/generate/reference";

const RECT: ResolvedRegion = {
  ring: [[-100, -100], [100, -100], [100, 100], [-100, 100]],
  center: [0, 0],
};

function oneBlock() {
  const grid = buildGrid(RECT, 0, 100); // 2x2 cells of 100x100
  const block = partitionBlocks(grid, RECT)[0]; // b:0:0, a 100x100 axis-frame block
  return { grid, block };
}

describe("subdivideBlock", () => {
  it("splits a 100x100 block to four ~50x50 lots at maxLotSize 50", () => {
    const { grid, block } = oneBlock();
    const lots = subdivideBlock(grid, block, { maxLotSizeM: 50, jitterFrac: 0 }, splitmix32(1));
    expect(lots).toHaveLength(4);
    for (const lot of lots) {
      expect(lot.areaM2).toBeCloseTo(2500, 6);
      expect(lot.blockId).toBe(block.id);
    }
    const total = lots.reduce((s, l) => s + l.areaM2, 0);
    expect(total).toBeCloseTo(100 * 100, 6); // lots tile the block, no overlap, no gap
  });

  it("keeps every lot within the lot-size band", () => {
    const { grid, block } = oneBlock();
    const lots = subdivideBlock(grid, block, { maxLotSizeM: 40, jitterFrac: 0.2 }, splitmix32(5));
    for (const lot of lots) {
      expect(lot.areaM2).toBeLessThanOrEqual(40 * 40 + 1e-6);
    }
  });

  it("places lot centroids inside the block", () => {
    const { grid, block } = oneBlock();
    const lots = subdivideBlock(grid, block, { maxLotSizeM: 50, jitterFrac: 0.2 }, splitmix32(9));
    for (const lot of lots) {
      expect(pointInRing(block.ring, lot.centroid[0], lot.centroid[1])).toBe(true);
    }
  });

  it("is deterministic for the same seed and varies with jitter across seeds", () => {
    const { grid, block } = oneBlock();
    const a = subdivideBlock(grid, block, { maxLotSizeM: 35, jitterFrac: 0.4 }, splitmix32(7));
    const b = subdivideBlock(grid, block, { maxLotSizeM: 35, jitterFrac: 0.4 }, splitmix32(7));
    const c = subdivideBlock(grid, block, { maxLotSizeM: 35, jitterFrac: 0.4 }, splitmix32(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
