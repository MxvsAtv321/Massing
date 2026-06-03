import { describe, it, expect } from "vitest";
import { lonLatToEnu } from "../src/coords/enu";

const LON0 = -79.3839;
const LAT0 = 43.6534;

describe("lonLatToEnu", () => {
  it("maps the origin to [0, 0]", () => {
    const [e, n] = lonLatToEnu(LON0, LAT0, LON0, LAT0);
    expect(Math.abs(e)).toBeLessThan(0.001);
    expect(Math.abs(n)).toBeLessThan(0.001);
  });

  it("maps 0.001 deg north to approximately 111.32 m north within 1 m", () => {
    const [, n] = lonLatToEnu(LON0, LAT0 + 0.001, LON0, LAT0);
    // 0.001 deg latitude * 111319.5 m/deg ≈ 111.32 m
    expect(Math.abs(n - 111.32)).toBeLessThan(1);
  });

  it("scale guard: 1 deg longitude at lat 43.65 maps to ~80 500 m east, not ~111 300 m", () => {
    // Without the cos(lat0) factor the result would be ~111 319 m (the meridian length).
    // With the correct formula it should be ~80 500 m (111 319 * cos(43.65°)).
    const [e] = lonLatToEnu(LON0 + 1, LAT0, LON0, LAT0);
    // Correct range: 80 000 – 81 000 m
    expect(e).toBeGreaterThan(80_000);
    expect(e).toBeLessThan(81_000);
    // Explicitly not the meridian value
    expect(e).toBeLessThan(90_000);
  });
});
