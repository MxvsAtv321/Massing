import { describe, it, expect } from "vitest";
import { daylightFor, skyGradeFor } from "../src/render/daylight";

describe("daylightFor", () => {
  it("intensity is monotonic non-decreasing with altitude up to a cap", () => {
    const alts = [-10, -1, 0, 5, 15, 30, 45, 60, 90];
    let prev = -1;
    for (const a of alts) {
      const d = daylightFor(a);
      expect(d.intensity).toBeGreaterThanOrEqual(prev);
      prev = d.intensity;
    }
  });

  it("is night with no directional light at or below the horizon", () => {
    const night = daylightFor(-5);
    expect(night.isNight).toBe(true);
    expect(night.intensity).toBeLessThan(0.001);

    const day = daylightFor(30);
    expect(day.isNight).toBe(false);
    expect(day.intensity).toBeGreaterThan(0);
  });

  it("is warmer (higher red-to-blue) at low sun than high sun", () => {
    const low = daylightFor(5);
    const high = daylightFor(60);
    expect(low.color[0] / low.color[2]).toBeGreaterThan(high.color[0] / high.color[2]);
  });

  it("ambient and dayFactor rise from night into day", () => {
    expect(daylightFor(40).ambient).toBeGreaterThan(daylightFor(-5).ambient);
    expect(daylightFor(0).dayFactor).toBe(0);
    expect(daylightFor(12).dayFactor).toBe(1);
    expect(daylightFor(6).dayFactor).toBeCloseTo(0.5);
  });
});

describe("skyGradeFor", () => {
  it("horizon is warmer at twilight than at midday", () => {
    const dusk = skyGradeFor(2);
    const day = skyGradeFor(40);
    const ratio = (c: [number, number, number]) => c[0] / (c[2] + 1e-6);
    expect(ratio(dusk.horizon)).toBeGreaterThan(ratio(day.horizon));
  });

  it("exposure dims toward night", () => {
    expect(skyGradeFor(-10).exposure).toBeLessThan(skyGradeFor(40).exposure);
  });
});
