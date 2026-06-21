import { describe, it, expect } from "vitest";
import { streetWidth, buildStreetGeometry } from "../src/render/streetGeometry";
import type { StreetSegment } from "../src/render/types";

describe("streetWidth", () => {
  it("uses lane count when it exceeds the class floor", () => {
    expect(streetWidth(3, "residential")).toBeCloseTo(10.8);
  });
  it("uses the class floor when the lane count is small", () => {
    expect(streetWidth(1, "motorway")).toBe(14);
  });
});

describe("buildStreetGeometry", () => {
  it("builds a flat ribbon along a straight segment with the shared axis map", () => {
    const seg: StreetSegment = {
      path: [
        [0, 0],
        [100, 0],
      ],
      lanes: 2,
      roadClass: "residential",
    };
    const geo = buildStreetGeometry([seg]);

    expect(geo.getAttribute("position").count).toBe(4); // 2 points x (left, right)
    expect(geo.getIndex()!.count).toBe(6); // one quad = two triangles

    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    expect(bb.min.x).toBeCloseTo(0);
    expect(bb.max.x).toBeCloseTo(100);
    // flat ribbon at the y-offset
    expect(bb.min.y).toBeCloseTo(0.08);
    expect(bb.max.y).toBeCloseTo(0.08);
    // width 2*3.6 = 7.2 -> half 3.6, perpendicular along z (north -> -z)
    expect(bb.min.z).toBeCloseTo(-3.6);
    expect(bb.max.z).toBeCloseTo(3.6);
  });

  it("skips degenerate single-point paths", () => {
    const geo = buildStreetGeometry([
      { path: [[0, 0]], lanes: 2, roadClass: "residential" },
    ]);
    expect(geo.getAttribute("position").count).toBe(0);
  });
});
