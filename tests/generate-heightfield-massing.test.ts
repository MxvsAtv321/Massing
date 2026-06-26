import { describe, it, expect } from "vitest";
import { massingToHeightfieldBuildings } from "../src/generate/heightfieldFromMassing";
import type { MassingPlacement } from "../src/generate/massing";

const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("massingToHeightfieldBuildings", () => {
  it("wraps a box footprint as a single occluder at its height", () => {
    const m: MassingPlacement = { id: "m", lotId: "l", template: "box", footprint: square, height: 30, storeys: 10 };
    const hf = massingToHeightfieldBuildings([m]);
    expect(hf).toHaveLength(1);
    expect(hf[0].height).toBe(30);
    expect(hf[0].footprint).toEqual([square]);
  });

  it("emits the tower and the podium as separate occluders", () => {
    const m: MassingPlacement = {
      id: "m",
      lotId: "l",
      template: "podium-tower",
      footprint: square,
      height: 72,
      storeys: 24,
      podium: { footprint: [[-2, -2], [12, -2], [12, 12], [-2, 12]], height: 12, storeys: 4 },
    };
    const hf = massingToHeightfieldBuildings([m]);
    expect(hf).toHaveLength(2);
    expect(hf.map((b) => b.height).sort((a, b) => a - b)).toEqual([12, 72]);
  });
});
