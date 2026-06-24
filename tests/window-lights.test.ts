import { describe, it, expect } from "vitest";
import {
  windowNightGain,
  windowSeed,
  isWindowLit,
  paneMask,
  wallMask,
  floorCoord,
  WINDOW_DEFAULTS,
} from "../src/render/windowLights";

describe("windowNightGain", () => {
  it("is off by day and full at night", () => {
    expect(windowNightGain(1)).toBeCloseTo(0, 6); // full day: dark
    expect(windowNightGain(0)).toBeCloseTo(1, 6); // night: lit
  });

  it("ramps through dusk and is monotonic in daylight", () => {
    const mid = windowNightGain(0.2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(windowNightGain(0.1)).toBeGreaterThan(windowNightGain(0.3));
  });

  it("clamps outside the ramp", () => {
    expect(windowNightGain(2)).toBeCloseTo(0, 6);
    expect(windowNightGain(-1)).toBeCloseTo(1, 6);
  });
});

describe("windowSeed", () => {
  it("is deterministic and in [0, 1)", () => {
    const a = windowSeed(3, 7, 0);
    const b = windowSeed(3, 7, 0);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it("differs for adjacent cells", () => {
    expect(windowSeed(3, 7)).not.toBe(windowSeed(3, 8));
    expect(windowSeed(3, 7)).not.toBe(windowSeed(4, 7));
  });
});

describe("isWindowLit", () => {
  it("lights roughly litFraction of a large grid (mostly dark)", () => {
    const f = WINDOW_DEFAULTS.litFraction;
    let lit = 0;
    let total = 0;
    for (let floor = 0; floor < 60; floor++) {
      for (let bay = -120; bay < 120; bay++) {
        if (isWindowLit(windowSeed(floor, bay), f)) lit++;
        total++;
      }
    }
    expect(lit / total).toBeGreaterThan(f - 0.03);
    expect(lit / total).toBeLessThan(f + 0.03);
  });
});

describe("paneMask", () => {
  it("is ~1 at the cell centre and 0 at the mullion edges", () => {
    expect(paneMask(0.5, 0.5)).toBeGreaterThan(0.9);
    expect(paneMask(0.02, 0.5)).toBeCloseTo(0, 6); // below the vertical inset
    expect(paneMask(0.5, 0.98)).toBeCloseTo(0, 6); // beyond the horizontal inset
  });
});

describe("wallMask", () => {
  it("is 1 on a vertical wall and 0 on a flat cap", () => {
    expect(wallMask(0)).toBeCloseTo(1, 6); // normal horizontal -> wall
    expect(wallMask(1)).toBeCloseTo(0, 6); // normal up -> roof/cap
  });
});

describe("floorCoord", () => {
  it("maps height to floor rows at the floor pitch", () => {
    expect(floorCoord(30, 3, 1)).toBeCloseTo(10, 6);
  });

  it("adds rows under a taller edit rather than stretching them", () => {
    // Doubling the ratio halves the floor coordinate, so a fixed world height holds
    // twice as many rows: raising a building fills in floors.
    expect(floorCoord(30, 3, 2)).toBeCloseTo(5, 6);
  });

  it("guards against a zero ratio", () => {
    expect(Number.isFinite(floorCoord(30, 3, 0))).toBe(true);
  });
});

describe("WINDOW_DEFAULTS", () => {
  it("keeps the restraint and bloom invariants", () => {
    expect(WINDOW_DEFAULTS.litFraction).toBeLessThan(0.5); // mostly dark
    expect(WINDOW_DEFAULTS.emissivePeak).toBeGreaterThan(1); // blooms
  });

  it("keeps the dynamics occasional and accents rare", () => {
    expect(WINDOW_DEFAULTS.dynamicFraction).toBeLessThan(0.2); // few windows switch
    expect(WINDOW_DEFAULTS.toggleRate).toBeLessThan(0.2); // slow, not a flicker
    expect(WINDOW_DEFAULTS.coolFraction).toBeLessThan(0.2); // cool accent is rare
    expect(WINDOW_DEFAULTS.brightJitter).toBeLessThan(1); // jitter stays positive
  });
});
