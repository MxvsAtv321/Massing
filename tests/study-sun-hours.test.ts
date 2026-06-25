import { describe, it, expect } from "vitest";
import { meanSunHours, sunlitFraction } from "../src/study/sunHours";
import type { RegionField } from "../src/study/studyTypes";

function field(hours: number[], maxPossibleHours = 9): RegionField {
  const n = Math.sqrt(hours.length);
  return {
    width: n,
    height: n,
    hours: Float32Array.from(hours),
    maxPossibleHours,
  };
}

describe("meanSunHours", () => {
  it("is the plain mean over all texels with no mask", () => {
    const f = field([0, 2, 4, 6]); // 2x2
    expect(meanSunHours(f)).toBeCloseTo(3, 6);
  });

  it("a fully-sunlit field equals the window hours", () => {
    const f = field([9, 9, 9, 9], 9);
    expect(meanSunHours(f)).toBeCloseTo(9, 6);
  });

  it("a fully-shaded field is zero", () => {
    const f = field([0, 0, 0, 0]);
    expect(meanSunHours(f)).toBe(0);
  });

  it("a mask restricts the reduction to the region texels", () => {
    const f = field([0, 0, 8, 8]);
    const mask = Uint8Array.from([0, 0, 1, 1]);
    expect(meanSunHours(f, mask)).toBeCloseTo(8, 6);
  });
});

describe("sunlitFraction", () => {
  it("counts texels at or above the threshold", () => {
    const f = field([0, 1, 2, 3]);
    expect(sunlitFraction(f, 2)).toBeCloseTo(0.5, 6); // 2 and 3 of 4
  });

  it("respects the mask", () => {
    const f = field([5, 5, 0, 0]);
    const mask = Uint8Array.from([0, 0, 1, 1]);
    expect(sunlitFraction(f, 1, mask)).toBe(0);
  });
});
