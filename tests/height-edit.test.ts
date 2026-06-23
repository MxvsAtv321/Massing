import { describe, it, expect } from "vitest";
import {
  MIN_STOREYS,
  MAX_STOREYS,
  clampStoreys,
  ratioToStoreys,
  storeysToRatio,
  clampRatio,
  committedRatio,
} from "../src/render/heightEdit";
import { buildClusterCentroids } from "../src/render/cityIndex";
import type { BuildingForScene } from "../src/mutation/building";

const MPS = 3; // metres per storey
const REP = 30; // representative height: a 10-storey building

describe("storeys <-> ratio round trip", () => {
  it("maps ratio 1 to the representative storey count", () => {
    expect(ratioToStoreys(1, REP, MPS)).toBe(REP / MPS); // 10
  });
  it("round-trips whole storeys through a ratio", () => {
    for (const s of [1, 5, 10, 40, 120]) {
      const r = storeysToRatio(s, REP, MPS);
      expect(ratioToStoreys(r, REP, MPS)).toBeCloseTo(s, 9);
    }
  });
  it("doubling the ratio doubles the storeys", () => {
    expect(ratioToStoreys(2, REP, MPS)).toBe(20);
  });
});

describe("clampStoreys", () => {
  it("rounds to a whole storey", () => {
    expect(clampStoreys(12.4)).toBe(12);
    expect(clampStoreys(12.6)).toBe(13);
  });
  it("holds the schema bounds 1..120", () => {
    expect(clampStoreys(0)).toBe(MIN_STOREYS);
    expect(clampStoreys(-5)).toBe(MIN_STOREYS);
    expect(clampStoreys(999)).toBe(MAX_STOREYS);
  });
});

describe("clampRatio", () => {
  it("never drops below a one-storey building", () => {
    const r = clampRatio(0, REP, MPS);
    expect(ratioToStoreys(r, REP, MPS)).toBeCloseTo(MIN_STOREYS, 9);
  });
  it("never exceeds the max-storey building", () => {
    const r = clampRatio(1000, REP, MPS);
    expect(ratioToStoreys(r, REP, MPS)).toBeCloseTo(MAX_STOREYS, 9);
  });
  it("passes a legal ratio through unchanged", () => {
    expect(clampRatio(2, REP, MPS)).toBe(2);
  });
});

describe("committedRatio", () => {
  it("is newRep / oldRep so the matrix matches the overlay height", () => {
    expect(committedRatio(60, 30)).toBe(2);
    expect(committedRatio(15, 30)).toBe(0.5);
  });
  it("falls back to 1 when the representative height is missing", () => {
    expect(committedRatio(60, 0)).toBe(1);
  });
});

describe("buildClusterCentroids", () => {
  function bld(id: string, clusterId: string, ring: [number, number][]): BuildingForScene {
    return { id, clusterId, footprint: [ring], heightValue: 10, confidenceKind: "measured" };
  }

  it("averages member vertices and maps ENU north to -Z", () => {
    // Two members of c0 forming a unit-ish footprint around (east=10, north=20).
    const buildings = [
      bld("a", "c0", [
        [0, 0],
        [20, 0],
        [20, 40],
        [0, 40],
        [0, 0],
      ]),
    ];
    const c = buildClusterCentroids(buildings).get("c0")!;
    expect(c[0]).toBeCloseTo(8, 9); // mean east of the 5 ring vertices
    expect(c[1]).toBeCloseTo(-16, 9); // mean north, negated for world Z
  });
});
