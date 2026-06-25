import { describe, it, expect } from "vitest";
import {
  buildHeightfield,
  sampleHeightAt,
  heightfieldSpecForBounds,
  type HeightfieldBuilding,
  type HeightfieldSpec,
} from "../src/study/heightfield";

const spec: HeightfieldSpec = {
  originE: -5,
  originN: -5,
  cellSize: 1,
  width: 30,
  height: 30,
};

const block: HeightfieldBuilding = {
  footprint: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
  height: 30,
};

describe("buildHeightfield", () => {
  it("rasterizes a footprint at its height and leaves open ground at zero", () => {
    const f = buildHeightfield([block], spec);
    expect(sampleHeightAt(f, 5, 5)).toBe(30); // inside the block
    expect(sampleHeightAt(f, -3, -3)).toBe(0); // open ground inside the grid
    expect(f.maxHeight).toBe(30);
  });

  it("keeps the taller of two overlapping buildings", () => {
    const tall: HeightfieldBuilding = { ...block, height: 80 };
    const f = buildHeightfield([block, tall], spec);
    expect(sampleHeightAt(f, 5, 5)).toBe(80);
    expect(f.maxHeight).toBe(80);
  });

  it("returns zero outside the grid and ignores zero-height buildings", () => {
    const f = buildHeightfield(
      [block, { footprint: block.footprint, height: 0 }],
      spec
    );
    expect(sampleHeightAt(f, 999, 999)).toBe(0);
    expect(sampleHeightAt(f, -999, 0)).toBe(0);
  });

  it("empty input is a flat zero field", () => {
    const f = buildHeightfield([], spec);
    expect(f.maxHeight).toBe(0);
    expect(Array.from(f.maxH).every((h) => h === 0)).toBe(true);
  });
});

describe("heightfieldSpecForBounds", () => {
  it("spans the bounds square at the cell size", () => {
    const s = heightfieldSpecForBounds([0, 0], 100, 5);
    expect(s.originE).toBe(-100);
    expect(s.originN).toBe(-100);
    expect(s.width).toBe(40);
    expect(s.height).toBe(40);
  });
});
