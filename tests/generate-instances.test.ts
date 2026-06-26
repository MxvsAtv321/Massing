import { describe, it, expect } from "vitest";
import { footprintBox, massingInstances } from "../src/generate/instances";
import type { MassingPlacement } from "../src/generate/massing";

describe("footprintBox", () => {
  it("derives center, extents, and zero rotation from an axis-aligned square", () => {
    const b = footprintBox([[0, 0], [10, 0], [10, 10], [0, 10]], 30);
    expect(b.cx).toBeCloseTo(5, 6);
    expect(b.cn).toBeCloseTo(5, 6);
    expect(b.width).toBeCloseTo(10, 6);
    expect(b.depth).toBeCloseTo(10, 6);
    expect(b.height).toBe(30);
    expect(b.rotation).toBeCloseTo(0, 6);
  });

  it("reads the rotation from the first edge of an oriented rectangle", () => {
    // First edge runs north (0,0)->(0,10): width 10 along a 90 deg rotation; depth 5.
    const b = footprintBox([[0, 0], [0, 10], [-5, 10], [-5, 0]], 12);
    expect(b.width).toBeCloseTo(10, 6);
    expect(b.depth).toBeCloseTo(5, 6);
    expect(b.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(b.cx).toBeCloseTo(-2.5, 6);
    expect(b.cn).toBeCloseTo(5, 6);
  });
});

describe("massingInstances", () => {
  const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];

  function box(): MassingPlacement {
    return { id: "m1", lotId: "l1", template: "box", footprint: square, height: 30, storeys: 10 };
  }
  function podiumTower(): MassingPlacement {
    return {
      id: "m2",
      lotId: "l2",
      template: "podium-tower",
      footprint: square,
      height: 72,
      storeys: 24,
      podium: { footprint: [[-2, -2], [12, -2], [12, 12], [-2, 12]], height: 12, storeys: 4 },
    };
  }

  it("emits one body per building and a podium only for podium-towers", () => {
    const { boxes, podiums } = massingInstances([box(), podiumTower()]);
    expect(boxes).toHaveLength(2);
    expect(podiums).toHaveLength(1);
    expect(podiums[0].height).toBe(12);
  });
});
