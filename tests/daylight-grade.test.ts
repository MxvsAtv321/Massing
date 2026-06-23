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

  it("keeps ambient a low floor by day, a touch higher at night, dayFactor rising into day", () => {
    // Night ambient is only a floor under the moonlight key; day stays low for
    // contrast under the strong sun.
    expect(daylightFor(-5).ambient).toBeGreaterThan(daylightFor(40).ambient);
    expect(daylightFor(40).ambient).toBeLessThan(0.1);
    expect(daylightFor(0).dayFactor).toBe(0);
    expect(daylightFor(12).dayFactor).toBe(1);
    expect(daylightFor(6).dayFactor).toBeCloseTo(0.5);
  });

  it("tints the night ambient cool and the day ambient neutral", () => {
    const night = daylightFor(-5);
    const day = daylightFor(40);
    const blueToRed = (c: [number, number, number]) => c[2] / c[0];
    expect(blueToRed(night.ambientColor)).toBeGreaterThan(blueToRed(day.ambientColor));
    expect(day.ambientColor[0]).toBeCloseTo(day.ambientColor[2], 5); // neutral by day
  });

  it("ramps cool moonlight in after sundown and off by day", () => {
    expect(daylightFor(-12).moonIntensity).toBeGreaterThan(0.3); // strong deep night
    expect(daylightFor(30).moonIntensity).toBeLessThan(0.001); // off by day
    // Deeper below the horizon means more moonlight.
    expect(daylightFor(-12).moonIntensity).toBeGreaterThan(daylightFor(-2).moonIntensity);
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
