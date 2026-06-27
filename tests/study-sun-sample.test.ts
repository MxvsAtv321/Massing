import { describe, it, expect } from "vitest";
import {
  buildSamples,
  maxPossibleHours,
  STUDY_MIN_SUN_ALTITUDE_DEG,
  type SunProvider,
} from "../src/study/sampleWindow";
import { defaultStudyConfig } from "../src/study/studyTypes";
import { sunAtMinutes } from "../src/render/sunInstant";

// St. Lawrence, Toronto, stored [lon, lat] per the loader convention.
const ORIGIN: [number, number] = [-79.37, 43.65];
const TZ = "America/Toronto";

describe("buildSamples with the real sun", () => {
  const realSun: SunProvider = (isoDate, min) => {
    const s = sunAtMinutes(ORIGIN, isoDate, min, TZ);
    return { altitude: s.altitude, azimuth: s.azimuth, dir: s.dir };
  };

  it("pulls a plausible equinox midday altitude", () => {
    const cfg = defaultStudyConfig("webgpu");
    const samples = buildSamples(cfg, realSun);
    // The sample nearest solar noon should be near the equinox max altitude at
    // 43.65 N, which is about 90 - 43.65 = 46 degrees.
    const noon = samples.reduce((a, b) =>
      Math.abs(b.minutesOfDay - 780) < Math.abs(a.minutesOfDay - 780) ? b : a
    );
    expect(noon.altitudeDeg).toBeGreaterThan(35);
    expect(noon.altitudeDeg).toBeLessThan(52);
  });

  it("never integrates more sun-hours than the window length", () => {
    const cfg = defaultStudyConfig("webgpu");
    const windowHours = (cfg.windowEndMin - cfg.windowStartMin) / 60;
    const total = maxPossibleHours(buildSamples(cfg, realSun));
    expect(total).toBeLessThanOrEqual(windowHours + 1e-9);
  });

  it("returns unit-length sun directions", () => {
    const [x, y, z] = buildSamples(defaultStudyConfig("webgpu"), realSun)[0].dir;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
  });
});

describe("buildSamples contribution threshold", () => {
  it("drops samples below the working altitude to zero weight", () => {
    const low: SunProvider = () => ({ altitude: 5, azimuth: 180, dir: [0, 1, 0] });
    const samples = buildSamples(defaultStudyConfig("webgpu"), low);
    expect(samples.every((s) => !s.contributes)).toBe(true);
    expect(maxPossibleHours(samples)).toBe(0);
  });

  it("includes samples at or above the threshold and sums to the window", () => {
    const high: SunProvider = () => ({ altitude: 30, azimuth: 180, dir: [0, 1, 0] });
    const cfg = defaultStudyConfig("webgpu");
    const samples = buildSamples(cfg, high);
    expect(samples.every((s) => s.contributes)).toBe(true);
    // Trapezoidal weighting lands the all-sunlit total on the true window hours.
    expect(maxPossibleHours(samples)).toBeCloseTo(
      (cfg.windowEndMin - cfg.windowStartMin) / 60,
      6
    );
  });

  it("treats exactly the threshold as contributing", () => {
    const edge: SunProvider = (_d, min) => ({
      altitude: min === 558 ? STUDY_MIN_SUN_ALTITUDE_DEG : STUDY_MIN_SUN_ALTITUDE_DEG - 0.1,
      azimuth: 180,
      dir: [0, 1, 0],
    });
    const samples = buildSamples(defaultStudyConfig("webgpu"), edge);
    expect(samples[0].contributes).toBe(true); // exactly 8 deg
    expect(samples[1].contributes).toBe(false); // 7.9 deg
  });
});
