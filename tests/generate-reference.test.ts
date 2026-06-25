import { describe, it, expect } from "vitest";
import {
  RegionRefSchema,
  AnchorRefSchema,
  AxisRefSchema,
  resolveRegion,
  resolveAnchor,
  resolveAxis,
  pointInRing,
  ReferenceResolveError,
  type RefContext,
} from "../src/generate/reference";

// ─── Fixture context ────────────────────────────────────────────────────────────

const CTX: RefContext = {
  namedRegions: {
    waterfront: { ring: [[0, 0], [200, 0], [200, 100], [0, 100]], center: [100, 50] },
  },
  waterEdge: [[0, 0], [300, 0]], // runs due east, bearing 0
  parkCentroid: [50, 50],
  streets: { "Front St": [[0, 10], [100, 10]] },
  districtBoundaries: { d1: [[0, 0], [50, 0], [50, 50], [0, 50]] },
};

// ─── resolveRegion ──────────────────────────────────────────────────────────────

describe("resolveRegion", () => {
  it("expands an unrotated rect to four corners with the given center", () => {
    const r = resolveRegion(
      { kind: "rect", center: [10, 20], halfExtents: [30, 40], rotationRad: 0 },
      CTX
    );
    expect(r.center).toEqual([10, 20]);
    expect(r.ring).toEqual([
      [-20, -20],
      [40, -20],
      [40, 60],
      [-20, 60],
    ]);
  });

  it("rotates a rect about its center", () => {
    const r = resolveRegion(
      { kind: "rect", center: [0, 0], halfExtents: [10, 5], rotationRad: Math.PI / 2 },
      CTX
    );
    expect(r.center).toEqual([0, 0]);
    expect(r.ring).toHaveLength(4);
    // First local corner (-10,-5) rotated +90 deg maps to (+5,-10).
    expect(r.ring[0][0]).toBeCloseTo(5, 6);
    expect(r.ring[0][1]).toBeCloseTo(-10, 6);
  });

  it("passes a polygon ring through and centers on its mean", () => {
    const r = resolveRegion({ kind: "polygon", ring: [[0, 0], [10, 0], [10, 10], [0, 10]] }, CTX);
    expect(r.ring).toHaveLength(4);
    expect(r.center).toEqual([5, 5]);
  });

  it("resolves a named region and throws on an unknown one", () => {
    expect(resolveRegion({ kind: "named", id: "waterfront" }, CTX).center).toEqual([100, 50]);
    expect(() => resolveRegion({ kind: "named", id: "nowhere" }, CTX)).toThrow(ReferenceResolveError);
  });

  it("defaults rotationRad to 0 when parsed without it", () => {
    const parsed = RegionRefSchema.parse({ kind: "rect", center: [0, 0], halfExtents: [1, 1] });
    if (parsed.kind !== "rect") throw new Error("wrong kind");
    expect(parsed.rotationRad).toBe(0);
  });
});

// ─── resolveAnchor ──────────────────────────────────────────────────────────────

describe("resolveAnchor", () => {
  it("resolves each anchor kind", () => {
    expect(resolveAnchor("waterEdge", CTX)).toEqual({ kind: "polyline", points: CTX.waterEdge });
    expect(resolveAnchor("parkCentroid", CTX)).toEqual({ kind: "point", point: [50, 50] });
    expect(resolveAnchor({ kind: "street", name: "Front St" }, CTX)).toEqual({
      kind: "polyline",
      points: [[0, 10], [100, 10]],
    });
    expect(resolveAnchor({ kind: "districtBoundary", district: "d1" }, CTX).kind).toBe("ring");
  });

  it("throws on a missing or unknown anchor", () => {
    expect(() => resolveAnchor({ kind: "street", name: "Nowhere Ave" }, CTX)).toThrow(ReferenceResolveError);
    expect(() => resolveAnchor({ kind: "districtBoundary", district: "zz" }, CTX)).toThrow(ReferenceResolveError);
    const noWater: RefContext = { ...CTX, waterEdge: undefined };
    expect(() => resolveAnchor("waterEdge", noWater)).toThrow(ReferenceResolveError);
  });
});

// ─── resolveAxis ────────────────────────────────────────────────────────────────

describe("resolveAxis", () => {
  it("converts a bearing to radians", () => {
    expect(resolveAxis({ kind: "bearing", deg: 90 }, CTX)).toBeCloseTo(Math.PI / 2, 6);
    expect(resolveAxis({ kind: "bearing", deg: 0 }, CTX)).toBeCloseTo(0, 6);
  });

  it("derives a parallel axis from a polyline anchor", () => {
    expect(resolveAxis({ kind: "parallelTo", anchor: "waterEdge" }, CTX)).toBeCloseTo(0, 6);
    expect(
      resolveAxis({ kind: "parallelTo", anchor: { kind: "street", name: "Front St" } }, CTX)
    ).toBeCloseTo(0, 6);
  });

  it("refuses to derive an axis parallel to a point anchor", () => {
    expect(() => resolveAxis({ kind: "parallelTo", anchor: "parkCentroid" }, CTX)).toThrow(
      ReferenceResolveError
    );
  });
});

// ─── Schema validation ──────────────────────────────────────────────────────────

describe("reference schemas", () => {
  it("rejects a rect with a non-positive half extent and a too-short polygon ring", () => {
    expect(RegionRefSchema.safeParse({ kind: "rect", center: [0, 0], halfExtents: [0, 10] }).success).toBe(false);
    expect(RegionRefSchema.safeParse({ kind: "polygon", ring: [[0, 0], [1, 1]] }).success).toBe(false);
  });

  it("rejects a bearing outside 0..360 and an unknown anchor keyword", () => {
    expect(AxisRefSchema.safeParse({ kind: "bearing", deg: 361 }).success).toBe(false);
    expect(AnchorRefSchema.safeParse("moon").success).toBe(false);
    expect(AnchorRefSchema.safeParse("waterEdge").success).toBe(true);
    expect(AnchorRefSchema.safeParse({ kind: "street", name: "X" }).success).toBe(true);
  });
});

// ─── pointInRing ────────────────────────────────────────────────────────────────

describe("pointInRing", () => {
  const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it("classifies inside and outside points against an open ring", () => {
    expect(pointInRing(square, 5, 5)).toBe(true);
    expect(pointInRing(square, 15, 5)).toBe(false);
    expect(pointInRing(square, -1, -1)).toBe(false);
  });
});
