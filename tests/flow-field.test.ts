import { describe, it, expect } from "vitest";
import {
  clampCongestion,
  congestionColor,
  congestionEmissive,
  dedupKey,
} from "../src/render/flowField";

describe("clampCongestion", () => {
  it("clamps v/c into [0,1]", () => {
    expect(clampCongestion(-1)).toBe(0);
    expect(clampCongestion(0.4)).toBe(0.4);
    expect(clampCongestion(2)).toBe(1);
  });
});

describe("congestionColor", () => {
  it("is green at free flow and red at jam", () => {
    expect(congestionColor(0)).toEqual([0.18, 0.7, 0.35]);
    expect(congestionColor(1)).toEqual([0.95, 0.2, 0.12]);
  });
  it("reddens with load: more red, less green", () => {
    const free = congestionColor(0.1);
    const jam = congestionColor(0.9);
    expect(jam[0]).toBeGreaterThan(free[0]);
    expect(jam[1]).toBeLessThan(free[1]);
  });
});

describe("congestionEmissive", () => {
  it("is dark at free flow and bright at jam", () => {
    expect(congestionEmissive(0)).toEqual([0, 0, 0]);
    expect(congestionEmissive(1)[0]).toBeGreaterThan(0.5);
  });
  it("rises monotonically in brightness with load", () => {
    const lum = (c: number) => {
      const [r, g, b] = congestionEmissive(c);
      return r + g + b;
    };
    expect(lum(0.8)).toBeGreaterThan(lum(0.3));
    expect(lum(0.3)).toBeGreaterThan(lum(0));
  });
});

describe("dedupKey", () => {
  it("is direction-independent", () => {
    expect(dedupKey(42, "a", "b")).toBe(dedupKey(42, "b", "a"));
  });
  it("separates different ways", () => {
    expect(dedupKey(42, "a", "b")).not.toBe(dedupKey(43, "a", "b"));
  });
});
