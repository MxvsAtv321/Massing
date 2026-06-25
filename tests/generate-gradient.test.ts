import { describe, it, expect } from "vitest";
import {
  sampleGradient,
  distanceToAnchor,
  type GradientField,
} from "../src/generate/gradient";

const POINT_DOWN: GradientField = {
  anchor: { kind: "point", point: [0, 0] },
  falloffM: 100,
  shape: "linear",
  direction: "down",
};

// ─── sampleGradient ─────────────────────────────────────────────────────────────

describe("sampleGradient", () => {
  it("is 0 at the anchor and 1 past the falloff for direction down", () => {
    expect(sampleGradient(POINT_DOWN, 0, 0)).toBe(0);
    expect(sampleGradient(POINT_DOWN, 100, 0)).toBe(1);
    expect(sampleGradient(POINT_DOWN, 300, 0)).toBe(1); // clamped past falloff
  });

  it("reverses for direction up (high at the anchor)", () => {
    const up: GradientField = { ...POINT_DOWN, direction: "up" };
    expect(sampleGradient(up, 0, 0)).toBe(1);
    expect(sampleGradient(up, 100, 0)).toBe(0);
  });

  it("smoothstep eases below the linear ramp before the midpoint", () => {
    const linear = sampleGradient({ ...POINT_DOWN, shape: "linear" }, 25, 0);
    const smooth = sampleGradient({ ...POINT_DOWN, shape: "smooth" }, 25, 0);
    expect(linear).toBeCloseTo(0.25, 6);
    expect(smooth).toBeCloseTo(0.25 * 0.25 * (3 - 0.5), 6); // 0.15625
    expect(smooth).toBeLessThan(linear);
  });

  it("is monotonic non-decreasing with distance for direction down", () => {
    let prev = -1;
    for (const x of [0, 20, 40, 60, 80, 100]) {
      const f = sampleGradient(POINT_DOWN, x, 0);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it("stays within [0,1] and never NaN across the field", () => {
    for (let x = -50; x <= 200; x += 7) {
      const f = sampleGradient({ ...POINT_DOWN, shape: "smooth" }, x, 0);
      expect(Number.isNaN(f)).toBe(false);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

// ─── distanceToAnchor ───────────────────────────────────────────────────────────

describe("distanceToAnchor", () => {
  it("measures to a point", () => {
    expect(distanceToAnchor({ kind: "point", point: [0, 0] }, 3, 4)).toBeCloseTo(5, 6);
  });

  it("measures perpendicular to a polyline segment", () => {
    const a = { kind: "polyline" as const, points: [[0, 0], [100, 0]] as [number, number][] };
    expect(distanceToAnchor(a, 50, 50)).toBeCloseTo(50, 6);
    expect(distanceToAnchor(a, 50, 0)).toBeCloseTo(0, 6);
  });
});
