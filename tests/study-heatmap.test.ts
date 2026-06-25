import { describe, it, expect } from "vitest";
import { heatmapColor, fieldToHeatmapData } from "../src/study/studyHeatmap";
import type { RegionField } from "../src/study/studyTypes";

describe("heatmapColor", () => {
  it("is cool and faint in full shadow, warm and strong in full sun", () => {
    const shade = heatmapColor(0);
    const sun = heatmapColor(1);
    expect(shade[2]).toBeGreaterThan(shade[0]); // shadow reads blue
    expect(sun[0]).toBeGreaterThan(sun[2]); // sun reads warm
    expect(sun[3]).toBeGreaterThan(shade[3]); // sun is more opaque
  });

  it("clamps outside 0..1", () => {
    expect(heatmapColor(-1)).toEqual(heatmapColor(0));
    expect(heatmapColor(2)).toEqual(heatmapColor(1));
  });
});

describe("fieldToHeatmapData", () => {
  const field = (hours: number[], maxPossibleHours = 9): RegionField => {
    const n = Math.sqrt(hours.length);
    return { width: n, height: n, hours: Float32Array.from(hours), maxPossibleHours };
  };

  it("produces RGBA per texel", () => {
    const data = fieldToHeatmapData(field([0, 0, 0, 0]));
    expect(data.length).toBe(4 * 4);
  });

  it("renders a sunlit texel warmer and more opaque than a shadowed one", () => {
    const data = fieldToHeatmapData(field([0, 9, 0, 0], 9)); // texel 1 fully sunlit
    const shade = [data[0], data[1], data[2], data[3]];
    const sun = [data[4], data[5], data[6], data[7]];
    expect(sun[0]).toBeGreaterThan(shade[0]); // warmer red
    expect(sun[3]).toBeGreaterThan(shade[3]); // more opaque
  });
});
