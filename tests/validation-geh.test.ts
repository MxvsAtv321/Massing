import { describe, it, expect } from "vitest";
import { gehStatistic } from "../src/traffic/validation";

describe("gehStatistic", () => {
  it("is zero when modeled equals counted", () => {
    expect(gehStatistic(500, 500)).toBe(0);
    expect(gehStatistic(0, 0)).toBe(0);
  });

  it("is symmetric in modeled and counted", () => {
    expect(gehStatistic(300, 700)).toBeCloseTo(gehStatistic(700, 300), 12);
  });

  it("matches the hand calculation (M=200, C=100 -> sqrt(2*100^2/300))", () => {
    expect(gehStatistic(200, 100)).toBeCloseTo(Math.sqrt((2 * 100 * 100) / 300), 12);
  });

  it("grows as the gap widens", () => {
    expect(gehStatistic(500, 900)).toBeGreaterThan(gehStatistic(500, 700));
  });
});
