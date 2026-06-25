import { describe, it, expect } from "vitest";
import { netNewShadow } from "../src/study/netNewShadow";
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

describe("netNewShadow", () => {
  it("is zero net-new and zero newly-shadowed for identical fields", () => {
    const base = field([8, 8, 8, 8]);
    const r = netNewShadow(base, field([8, 8, 8, 8]), 1);
    expect(r.netNewShadowHours).toBeCloseTo(0, 6);
    expect(r.newlyShadowedFraction).toBe(0);
    expect(r.exceedsThreshold).toBe(false);
  });

  it("reports the mean drop when the current is strictly darker", () => {
    const base = field([8, 8, 8, 8]);
    const current = field([6, 6, 6, 6]);
    const r = netNewShadow(base, current, 1);
    expect(r.baselineMeanSunHours).toBeCloseTo(8, 6);
    expect(r.meanSunHours).toBeCloseTo(6, 6);
    expect(r.netNewShadowHours).toBeCloseTo(2, 6);
  });

  it("flips exceedsThreshold exactly at the dial", () => {
    const base = field([4, 4, 4, 4]);
    const current = field([2, 2, 2, 2]); // net-new = 2
    expect(netNewShadow(base, current, 2.0).exceedsThreshold).toBe(false); // not strictly over
    expect(netNewShadow(base, current, 1.9).exceedsThreshold).toBe(true);
  });

  it("counts only texels that flip from sunlit to shadowed", () => {
    // sunlitMin defaults to 1: texel 0 flips (2 -> 0.5), texel 1 stays lit,
    // texel 2 was already dark, texel 3 stays lit.
    const base = field([2, 3, 0, 4]);
    const current = field([0.5, 3, 0, 4]);
    const r = netNewShadow(base, current, 0.1);
    expect(r.newlyShadowedFraction).toBeCloseTo(0.25, 6); // 1 of 4
  });

  it("masks the metric to the region footprint", () => {
    const base = field([8, 8, 0, 0]);
    const current = field([4, 4, 0, 0]);
    const mask = Uint8Array.from([1, 1, 0, 0]);
    const r = netNewShadow(base, current, 1, mask);
    expect(r.baselineMeanSunHours).toBeCloseTo(8, 6);
    expect(r.netNewShadowHours).toBeCloseTo(4, 6);
  });

  it("throws when the fields differ in size", () => {
    expect(() => netNewShadow(field([1, 1, 1, 1]), field([1, 1, 1, 1, 1, 1, 1, 1, 1]), 1)).toThrow();
  });
});
