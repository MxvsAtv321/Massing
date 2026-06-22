import { describe, it, expect } from "vitest";
import {
  advanceMinutes,
  wrapDay,
  wallTime,
  MINUTES_PER_DAY,
} from "../src/render/dayClock";

describe("wrapDay", () => {
  it("keeps a value in [0, 1440) and wraps both ends", () => {
    expect(wrapDay(0)).toBe(0);
    expect(wrapDay(MINUTES_PER_DAY)).toBe(0);
    expect(wrapDay(1500)).toBe(60);
    expect(wrapDay(-30)).toBe(1410);
    expect(wrapDay(2 * MINUTES_PER_DAY)).toBe(0);
  });
});

describe("advanceMinutes", () => {
  it("advances by dt scaled by speed", () => {
    expect(advanceMinutes(0, 2, 30)).toBe(60);
  });
  it("wraps forward across the day boundary", () => {
    expect(advanceMinutes(1430, 1, 60)).toBe(50);
  });
  it("wraps backward when speed is negative", () => {
    expect(advanceMinutes(10, 1, -60)).toBe(1390);
  });
  it("always stays inside a single day", () => {
    const m = advanceMinutes(1200, 10, 1000);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(MINUTES_PER_DAY);
  });
});

describe("wallTime", () => {
  it("splits minutes into hour and minute", () => {
    expect(wallTime(0)).toEqual({ hour: 0, minute: 0 });
    expect(wallTime(870)).toEqual({ hour: 14, minute: 30 });
    expect(wallTime(1439)).toEqual({ hour: 23, minute: 59 });
  });
  it("wraps before splitting", () => {
    expect(wallTime(1500)).toEqual({ hour: 1, minute: 0 });
  });
});
