import { describe, it, expect } from "vitest";
import { sunDirFromAltAz, MIN_SUN_ALTITUDE_DEG } from "../src/solar/sun";

// Tolerance for floating-point comparisons.
const EPS = 1e-6;

describe("sunDirFromAltAz", () => {
  // Test case 1: overhead sun.
  it("alt=90 -> sunDir (0, 1, 0) regardless of azimuth", () => {
    const { sunDir } = sunDirFromAltAz(90, 0);
    expect(Math.abs(sunDir.x)).toBeLessThan(EPS);
    expect(sunDir.y).toBeCloseTo(1, 6);
    expect(Math.abs(sunDir.z)).toBeLessThan(EPS);
  });

  // Test case 2: sun due north, half elevation.
  // az=0 -> east=0, north=cos(45), up=sin(45). Three.js z = -north = -0.707.
  it("alt=45, az=0 (due north) -> sunDir (0, 0.707, -0.707)", () => {
    const { sunDir } = sunDirFromAltAz(45, 0);
    expect(Math.abs(sunDir.x)).toBeLessThan(EPS);
    expect(sunDir.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(sunDir.z).toBeCloseTo(-Math.SQRT1_2, 5);
  });

  // Test case 3: sun due south, half elevation (the solar noon case).
  // az=180 -> east=0, north=-cos(45), so z = -(-0.707) = +0.707.
  it("alt=45, az=180 (due south) -> sunDir (0, 0.707, +0.707)", () => {
    const { sunDir } = sunDirFromAltAz(45, 180);
    expect(Math.abs(sunDir.x)).toBeLessThan(EPS);
    expect(sunDir.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(sunDir.z).toBeCloseTo(Math.SQRT1_2, 5);
  });

  // Test case 4: sun due east.
  // az=90 -> east=cos(45), north=0, up=sin(45). Three.js z = 0.
  it("alt=45, az=90 (due east) -> sunDir (0.707, 0.707, 0)", () => {
    const { sunDir } = sunDirFromAltAz(45, 90);
    expect(sunDir.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(sunDir.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Math.abs(sunDir.z)).toBeLessThan(EPS);
  });

  it("sunDir is always unit length for a range of inputs", () => {
    const cases = [
      [10, 0], [30, 45], [60, 90], [80, 180], [45, 270], [15, 315],
    ] as const;
    for (const [alt, az] of cases) {
      const { sunDir } = sunDirFromAltAz(alt, az);
      expect(sunDir.length()).toBeCloseTo(1, 10);
    }
  });

  it("below horizon -> isUsable false", () => {
    const { isUsable } = sunDirFromAltAz(-5, 180);
    expect(isUsable).toBe(false);
  });

  it("alt below MIN_SUN_ALTITUDE_DEG -> isUsable false", () => {
    const { isUsable } = sunDirFromAltAz(MIN_SUN_ALTITUDE_DEG - 1, 90);
    expect(isUsable).toBe(false);
  });

  it("alt == MIN_SUN_ALTITUDE_DEG -> isUsable true (on threshold)", () => {
    const { isUsable } = sunDirFromAltAz(MIN_SUN_ALTITUDE_DEG, 90);
    expect(isUsable).toBe(true);
  });

  it("alt > MIN_SUN_ALTITUDE_DEG -> isUsable true", () => {
    const { isUsable } = sunDirFromAltAz(45, 180);
    expect(isUsable).toBe(true);
  });

  // Solar noon axis check (mirrors verify-solar.ts section 1):
  // sunDir.z > 0 because south = +Z in Three.js, shadow falls -Z = north.
  it("az=180 (solar noon) -> sunDir.z is positive (sun in south = +Z hemisphere)", () => {
    const { sunDir } = sunDirFromAltAz(69, 180); // summer solstice-ish
    expect(sunDir.z).toBeGreaterThan(0.3);
    expect(Math.abs(sunDir.x)).toBeLessThan(0.01);
  });
});
