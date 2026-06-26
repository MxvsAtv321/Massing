import { describe, it, expect } from "vitest";
import { assemblyDelays, assemblyScale } from "../src/generate/assembly";
import type { BoxInstance } from "../src/generate/instances";

const box = (cx: number, cn: number): BoxInstance => ({
  cx,
  cn,
  width: 10,
  depth: 10,
  height: 30,
  rotation: 0,
});

const PARAMS = { durationS: 3, riseS: 1, jitterS: 0 };

describe("assemblyDelays", () => {
  it("sweeps from the near corner: nearest starts at 0, farthest at the window end", () => {
    const boxes = [box(0, 0), box(100, 0), box(50, 0)];
    const delays = assemblyDelays(boxes, PARAMS, 1);
    expect(delays[0]).toBeCloseTo(0, 6); // at the min corner
    expect(delays[1]).toBeCloseTo(2, 6); // window = duration - rise = 2
    expect(delays[2]).toBeCloseTo(1, 6); // halfway across
  });

  it("is empty for no boxes", () => {
    expect(assemblyDelays([], PARAMS, 1)).toEqual([]);
  });

  it("is deterministic with jitter for a given seed", () => {
    const boxes = [box(0, 0), box(30, 40), box(80, 10)];
    const a = assemblyDelays(boxes, { ...PARAMS, jitterS: 0.5 }, 7);
    const b = assemblyDelays(boxes, { ...PARAMS, jitterS: 0.5 }, 7);
    expect(a).toEqual(b);
  });
});

describe("assemblyScale", () => {
  it("is 0 before the delay and 1 after the rise", () => {
    expect(assemblyScale(0, 1, 1)).toBe(0);
    expect(assemblyScale(1, 1, 1)).toBe(0); // exactly at delay
    expect(assemblyScale(2, 1, 1)).toBe(1); // delay + rise
    expect(assemblyScale(5, 1, 1)).toBe(1);
  });

  it("eases (easeOutCubic) in between", () => {
    expect(assemblyScale(1.5, 1, 1)).toBeCloseTo(0.875, 6); // 1 - 0.5^3
  });

  it("is monotonic non-decreasing in t", () => {
    let prev = -1;
    for (let t = 0; t <= 2.5; t += 0.1) {
      const s = assemblyScale(t, 0.5, 1);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});
