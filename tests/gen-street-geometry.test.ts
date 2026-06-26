import { describe, it, expect } from "vitest";
import { ribbonData } from "../src/render/genStreetGeometry";

describe("ribbonData", () => {
  it("builds one quad per segment with the right corners", () => {
    const { positions, indices } = ribbonData([[[0, 0], [10, 0]]], 2, 0.1);
    expect(positions.length).toBe(12); // 4 vertices x 3
    expect(indices.length).toBe(6); // 2 triangles
    // Corners offset perpendicular (north) by 2, mapped to world [e, y, -n]. (Float32 stores 0.1
    // inexactly, so compare with tolerance.)
    const expected = [0, 0.1, -2, 0, 0.1, 2, 10, 0.1, 2, 10, 0.1, -2];
    for (let i = 0; i < expected.length; i++) expect(positions[i]).toBeCloseTo(expected[i], 5);
    expect(Array.from(indices)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("returns empty arrays for no polylines and skips zero-length segments", () => {
    expect(ribbonData([], 2, 0.1).positions.length).toBe(0);
    expect(ribbonData([[[5, 5], [5, 5]]], 2, 0.1).indices.length).toBe(0);
  });

  it("accumulates multiple segments", () => {
    const { positions, indices } = ribbonData(
      [[[0, 0], [10, 0]], [[0, 0], [0, 10]]],
      1,
      0
    );
    expect(positions.length).toBe(24); // 2 quads x 4 x 3
    expect(indices.length).toBe(12);
    expect(Array.from(indices.slice(6))).toEqual([4, 5, 6, 4, 6, 7]); // second quad offset
  });
});
