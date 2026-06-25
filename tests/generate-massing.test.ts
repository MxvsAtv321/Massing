import { describe, it, expect } from "vitest";
import { massLot } from "../src/generate/massing";
import { ringArea } from "../src/generate/fill";
import { pointInRing } from "../src/generate/reference";
import type { Lot } from "../src/generate/lots";

const LOT: Lot = {
  id: "b:0:0/l0",
  blockId: "b:0:0",
  ring: [[0, 0], [50, 0], [50, 50], [0, 50]],
  centroid: [25, 25],
  areaM2: 2500,
};

describe("massLot", () => {
  it("emits a plain box below the podium threshold", () => {
    const m = massLot(LOT, 10, 0.5, 3);
    expect(m.template).toBe("box");
    expect(m.podium).toBeUndefined();
    expect(m.height).toBeCloseTo(30, 6); // 10 * 3
    expect(m.storeys).toBe(10);
  });

  it("insets the footprint so its area is coverage times the lot", () => {
    const m = massLot(LOT, 10, 0.5, 3);
    expect(ringArea(m.footprint)).toBeCloseTo(0.5 * LOT.areaM2, 6);
  });

  it("keeps the footprint inside the lot", () => {
    const m = massLot(LOT, 10, 0.4, 3);
    for (const [e, n] of m.footprint) {
      expect(pointInRing(LOT.ring, e, n)).toBe(true);
    }
  });

  it("adds a wider podium above the threshold", () => {
    const m = massLot(LOT, 24, 0.4, 3);
    expect(m.template).toBe("podium-tower");
    expect(m.podium).toBeDefined();
    expect(m.height).toBeCloseTo(72, 6); // 24 * 3
    // The podium is wider than the tower footprint.
    expect(ringArea(m.podium!.footprint)).toBeGreaterThan(ringArea(m.footprint));
  });
});
