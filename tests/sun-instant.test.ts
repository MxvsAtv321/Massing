import { describe, it, expect } from "vitest";
import { goldenHourSun } from "../src/render/sunInstant";

// St. Lawrence origin, stored [lon, lat] per the loader convention.
const ORIGIN: [number, number] = [-79.371, 43.649];
const TZ = "America/Toronto";

describe("goldenHourSun", () => {
  const sun = goldenHourSun(ORIGIN, TZ);

  it("returns a unit vector above the horizon", () => {
    const [x, y, z] = sun.dir;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
    expect(y).toBeGreaterThan(0);
  });

  it("is a low, western, golden-hour sun", () => {
    expect(sun.altitude).toBeGreaterThan(0);
    expect(sun.altitude).toBeLessThan(30);
    expect(sun.azimuth).toBeGreaterThan(270);
    expect(sun.azimuth).toBeLessThan(330);
  });
});
