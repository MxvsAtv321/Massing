import { describe, it, expect } from "vitest";
import {
  ringArea,
  floorArea,
  computeFill,
  requestedUnits,
  FLOOR_EFFICIENCY,
  UNIT_AREA_M2,
  AVG_HOUSEHOLD_SIZE,
} from "../src/generate/fill";
import type { MassingPlacement } from "../src/generate/massing";

const SQUARE: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];

function box(storeys: number, side: number): MassingPlacement {
  const r: [number, number][] = [[0, 0], [side, 0], [side, side], [0, side]];
  return { id: "m", lotId: "l", template: "box", footprint: r, height: storeys * 3, storeys };
}

describe("ringArea / floorArea", () => {
  it("areas a polygon by the shoelace formula", () => {
    expect(ringArea(SQUARE)).toBeCloseTo(100, 6);
  });

  it("floors a box as footprint area times storeys", () => {
    expect(floorArea(box(10, 20))).toBeCloseTo(400 * 10, 6);
  });

  it("counts the podium floors and the tower floors above it without double counting", () => {
    const tower: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]; // area 100
    const podium: [number, number][] = [[0, 0], [20, 0], [20, 20], [0, 20]]; // area 400
    const m: MassingPlacement = {
      id: "m",
      lotId: "l",
      template: "podium-tower",
      footprint: tower,
      height: 60,
      storeys: 20,
      podium: { footprint: podium, height: 12, storeys: 4 },
    };
    // podium: 400 * 4, tower above podium: 100 * (20 - 4)
    expect(floorArea(m)).toBeCloseTo(400 * 4 + 100 * 16, 6);
  });
});

describe("computeFill", () => {
  it("derives achieved units from the built floor area", () => {
    const massing = [box(10, 20), box(10, 20)]; // gross = 2 * 400 * 10 = 8000
    const r = computeFill(massing, "residential", 100);
    const expected = Math.floor((8000 * FLOOR_EFFICIENCY) / UNIT_AREA_M2.residential);
    expect(r.achievedUnits).toBe(expected);
    expect(r.buildingCount).toBe(2);
  });

  it("reports a shortfall when the target is above what was built", () => {
    const r = computeFill([box(2, 10)], "residential", 100000);
    expect(r.metTarget).toBe(false);
    expect(r.shortfall).toBe(100000 - r.achievedUnits);
  });

  it("meets the target with no shortfall when the build exceeds it", () => {
    const r = computeFill([box(40, 40)], "residential", 1);
    expect(r.metTarget).toBe(true);
    expect(r.shortfall).toBe(0);
  });
});

describe("requestedUnits", () => {
  it("converts a population target through household size", () => {
    expect(requestedUnits({ population: 4200 }, 0)).toBe(Math.round(4200 / AVG_HOUSEHOLD_SIZE));
  });

  it("converts a unitsPerHa target through the district area", () => {
    expect(requestedUnits({ unitsPerHa: 100 }, 20000)).toBe(200); // 2 ha
  });
});
