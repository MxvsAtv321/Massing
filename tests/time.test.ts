import { describe, it, expect } from "vitest";
import { toTorontoUtc, formatTorontoTime } from "../src/solar/time";

describe("toTorontoUtc", () => {
  it("June 14: 2:00 PM Toronto = 18:00 UTC (EDT = UTC-4)", () => {
    const d = toTorontoUtc("2026-06-14", 14, 0);
    expect(d.getUTCHours()).toBe(18);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCDate()).toBe(14);
    expect(d.getUTCMonth()).toBe(5); // June = month index 5
  });

  it("January 14: 2:00 PM Toronto = 19:00 UTC (EST = UTC-5)", () => {
    const d = toTorontoUtc("2026-01-14", 14, 0);
    expect(d.getUTCHours()).toBe(19);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCDate()).toBe(14);
  });

  it("11:30 PM Toronto EDT crosses into the next UTC day", () => {
    const d = toTorontoUtc("2026-06-14", 23, 30);
    // 23:30 EDT = next day 03:30 UTC
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(3);
    expect(d.getUTCMinutes()).toBe(30);
  });

  it("preserves minutes correctly", () => {
    const d = toTorontoUtc("2026-06-14", 10, 45);
    expect(d.getUTCHours()).toBe(14); // 10 + 4 (EDT offset)
    expect(d.getUTCMinutes()).toBe(45);
  });

  it("midnight local stays on the same calendar day (EDT)", () => {
    const d = toTorontoUtc("2026-06-14", 0, 0);
    // 00:00 EDT = 04:00 UTC same day
    expect(d.getUTCDate()).toBe(14);
    expect(d.getUTCHours()).toBe(4);
  });

  it("throws on an invalid date string", () => {
    expect(() => toTorontoUtc("not-a-date", 10, 0)).toThrow();
  });
});

describe("formatTorontoTime", () => {
  it("shows EDT in summer", () => {
    const d = toTorontoUtc("2026-06-14", 14, 30);
    const s = formatTorontoTime(d);
    expect(s).toContain("EDT");
    expect(s).toContain("2:30 PM");
  });

  it("shows EST in winter", () => {
    const d = toTorontoUtc("2026-01-14", 14, 30);
    const s = formatTorontoTime(d);
    expect(s).toContain("EST");
  });
});
