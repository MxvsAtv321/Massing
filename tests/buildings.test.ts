import { describe, it, expect } from "vitest";
import { buildMergedGeometry, computeModelBounds } from "../src/scene/buildings";
import type { BuildingForScene } from "../src/scene/buildings";

// A simple 10x10 m square building at the ENU origin, 20 m tall.
const SQUARE_BUILDING: BuildingForScene = {
  id: "sq1",
  footprint: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0], // closing vertex
    ],
  ],
  heightValue: 20,
  clusterId: "c0",
};

// A building with a hole (courtyard).
const COURTYARD_BUILDING: BuildingForScene = {
  id: "cy1",
  footprint: [
    // Outer ring 30x30 m
    [
      [0, 0], [30, 0], [30, 30], [0, 30], [0, 0],
    ],
    // Hole 10x10 m inset
    [
      [10, 10], [20, 10], [20, 20], [10, 20], [10, 10],
    ],
  ],
  heightValue: 15,
  clusterId: "c1",
};

// A building offset from origin to test bounds centring.
const OFFSET_BUILDING: BuildingForScene = {
  id: "off1",
  footprint: [
    [[100, 200], [110, 200], [110, 210], [100, 210], [100, 200]],
  ],
  heightValue: 30,
  clusterId: "c2",
};

describe("buildMergedGeometry", () => {
  it("produces a non-null BufferGeometry with position attribute", () => {
    const geo = buildMergedGeometry([SQUARE_BUILDING]);
    expect(geo).not.toBeNull();
    expect(geo!.attributes.position).toBeDefined();
    expect(geo!.attributes.position.count).toBeGreaterThan(0);
  });

  it("has enough vertices for a 4-vertex footprint building", () => {
    // A square prism has 4 side faces (4*2 triangles) + 2 cap faces.
    // ExtrudeGeometry with 4-vertex shape produces at least 12 vertices.
    const geo = buildMergedGeometry([SQUARE_BUILDING]);
    expect(geo!.attributes.position.count).toBeGreaterThanOrEqual(12);
  });

  it("produces geometry for a building with a hole", () => {
    const geo = buildMergedGeometry([COURTYARD_BUILDING]);
    expect(geo).not.toBeNull();
    expect(geo!.attributes.position.count).toBeGreaterThan(0);
  });

  it("merges multiple buildings into one geometry", () => {
    const geo1 = buildMergedGeometry([SQUARE_BUILDING]);
    const geo2 = buildMergedGeometry([COURTYARD_BUILDING]);
    const merged = buildMergedGeometry([SQUARE_BUILDING, COURTYARD_BUILDING]);
    // Merged vertex count should equal the sum of individual counts.
    expect(merged!.attributes.position.count).toBe(
      geo1!.attributes.position.count + geo2!.attributes.position.count
    );
  });

  it("returns null for an empty array", () => {
    expect(buildMergedGeometry([])).toBeNull();
  });

  it("skips buildings with zero height", () => {
    const zeroH = { ...SQUARE_BUILDING, heightValue: 0 };
    expect(buildMergedGeometry([zeroH])).toBeNull();
  });
});

describe("computeModelBounds", () => {
  it("returns a centre near the midpoint of the footprint", () => {
    const { center } = computeModelBounds([SQUARE_BUILDING]);
    // Square 0-10 in east, 0-10 in north. Three.js: X in [0,10], Z in [-10,0].
    // Center.x = 5, center.z = -5, center.y = maxHeight/2 = 10.
    expect(center.x).toBeCloseTo(5, 1);
    expect(center.z).toBeCloseTo(-5, 1);
    expect(center.y).toBeCloseTo(10, 1);
  });

  it("returns a positive radius", () => {
    const { radius } = computeModelBounds([SQUARE_BUILDING]);
    expect(radius).toBeGreaterThan(0);
  });

  it("centres correctly on an offset building", () => {
    const { center, radius } = computeModelBounds([OFFSET_BUILDING]);
    expect(center.x).toBeCloseTo(105, 0); // (100+110)/2 = 105
    expect(center.z).toBeCloseTo(-205, 0); // -(200+210)/2 = -205
    expect(radius).toBeGreaterThan(4);
  });

  it("returns a fallback for an empty list", () => {
    const { radius } = computeModelBounds([]);
    expect(radius).toBeGreaterThan(0);
  });
});
