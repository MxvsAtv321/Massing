import { describe, it, expect } from "vitest";
import { carLightGain } from "../src/render/carLook";

describe("carLightGain", () => {
  it("is dim by day and bright at night", () => {
    expect(carLightGain(1)).toBeCloseTo(0.3, 6); // full day: faint lamps
    expect(carLightGain(0)).toBeCloseTo(1.2, 6); // night: lamps bloom
  });

  it("ramps linearly across dusk", () => {
    expect(carLightGain(0.5)).toBeCloseTo(0.75, 6);
  });

  it("clamps out-of-range day factors", () => {
    expect(carLightGain(2)).toBeCloseTo(0.3, 6);
    expect(carLightGain(-1)).toBeCloseTo(1.2, 6);
  });

  it("is monotonic: darker day means brighter lamps", () => {
    expect(carLightGain(0.2)).toBeGreaterThan(carLightGain(0.8));
  });
});
