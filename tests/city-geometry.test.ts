import { describe, it, expect } from "vitest";
import {
  buildBuildingGeometries,
  computeModelBounds,
} from "../src/render/cityGeometry";
import type { BuildingForScene } from "../src/mutation/building";

function building(
  id: string,
  footprint: number[][][],
  heightValue: number
): BuildingForScene {
  return { id, footprint, heightValue, clusterId: id, confidenceKind: "measured" };
}

const SQUARE: number[][][] = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
];

describe("buildBuildingGeometries", () => {
  it("extrudes a square footprint to its height with the shared axis mapping", () => {
    const { geometries, ids } = buildBuildingGeometries([building("b1", SQUARE, 30)]);
    expect(geometries).toHaveLength(1);
    expect(ids).toEqual(["b1"]);

    const geo = geometries[0];
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    // east 0..10 -> x 0..10; up 0..30 -> y 0..30; north 0..10 -> z -10..0
    expect(bb.min.x).toBeCloseTo(0);
    expect(bb.max.x).toBeCloseTo(10);
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(30);
    expect(bb.min.z).toBeCloseTo(-10);
    expect(bb.max.z).toBeCloseTo(0);

    // Indexed so it drops straight into a BatchedMesh.
    expect(geo.getIndex()).not.toBeNull();
  });

  it("skips non-positive heights and degenerate footprints", () => {
    const { geometries } = buildBuildingGeometries([
      building("ok", SQUARE, 12),
      building("noHeight", SQUARE, 0),
      building("tooFewPoints", [[[0, 0], [1, 0], [0, 0]]], 12),
    ]);
    expect(geometries).toHaveLength(1);
  });
});

describe("computeModelBounds", () => {
  it("centers on the footprint extent with a positive radius", () => {
    const bounds = computeModelBounds([building("b1", SQUARE, 10)]);
    expect(bounds.center[0]).toBeCloseTo(5);
    expect(bounds.center[1]).toBeCloseTo(5);
    expect(bounds.radius).toBeGreaterThan(0);
  });

  it("falls back to a safe default when there are no footprints", () => {
    const bounds = computeModelBounds([]);
    expect(bounds.center).toEqual([0, 0]);
    expect(bounds.radius).toBeGreaterThan(0);
  });
});
