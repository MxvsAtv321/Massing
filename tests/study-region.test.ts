import { describe, it, expect } from "vitest";
import {
  regionArea,
  regionTexelToEnu,
  enuInRegion,
  parseRegions,
} from "../src/study/region";
import type { AnalysisRegion } from "../src/study/studyTypes";
import regionsJson from "../data/study-regions.json";

const rect: AnalysisRegion = {
  id: "r",
  name: "r",
  kind: "rect",
  center: [10, 20],
  halfExtents: [30, 10],
  rotationRad: 0,
  source: "placed",
};

describe("regionArea", () => {
  it("is width times depth for a rect", () => {
    expect(regionArea(rect)).toBeCloseTo(60 * 20, 6);
  });

  it("uses the shoelace area for a polygon", () => {
    const poly: AnalysisRegion = {
      id: "p",
      name: "p",
      kind: "polygon",
      center: [0, 0],
      halfExtents: [0, 0],
      rotationRad: 0,
      ring: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      source: "placed",
    };
    expect(regionArea(poly)).toBeCloseTo(12, 6);
  });
});

describe("enuInRegion", () => {
  it("is true at the center and false well outside", () => {
    expect(enuInRegion(rect, 10, 20)).toBe(true);
    expect(enuInRegion(rect, 100, 100)).toBe(false);
  });

  it("respects rotation: a 90 degree turn swaps the extents", () => {
    const turned: AnalysisRegion = { ...rect, rotationRad: Math.PI / 2 };
    // Unrotated this point sits on the east edge (inside); after a 90 deg turn the
    // east extent is only 10, so it falls outside.
    expect(enuInRegion(rect, 40, 20)).toBe(true);
    expect(enuInRegion(turned, 40, 20)).toBe(false);
    // The long axis is now north: 40 m north of center is inside the 30 m extent.
    expect(enuInRegion(turned, 10, 50)).toBe(true);
  });
});

describe("regionTexelToEnu", () => {
  it("round-trips the four corners to inside (boundary inclusive)", () => {
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const [e, n] = regionTexelToEnu(rect, u, v);
      expect(enuInRegion(rect, e, n)).toBe(true);
    }
  });

  it("maps the center texel to the region center", () => {
    expect(regionTexelToEnu(rect, 0.5, 0.5)).toEqual([10, 20]);
  });
});

describe("parseRegions", () => {
  it("parses the authored default regions with sane extents", () => {
    const regions = parseRegions(regionsJson);
    expect(regions.length).toBe(2);
    const park = regions.find((r) => r.id === "st-james-park");
    expect(park).toBeDefined();
    expect(park!.source).toBe("authored");
    expect(regionArea(park!)).toBeGreaterThan(0);
  });

  it("throws on a malformed entry and on a zero-area region", () => {
    expect(() => parseRegions({ regions: [{ id: "x" }] })).toThrow();
    expect(() => parseRegions({})).toThrow();
    expect(() =>
      parseRegions({
        regions: [{ id: "z", name: "z", kind: "rect", center: [0, 0], halfExtents: [0, 5] }],
      })
    ).toThrow();
  });
});
