import { describe, it, expect } from "vitest";
import { carLightGain } from "../src/render/carLook";

describe("carLightGain", () => {
  it("is a faint accent by day and a gentle glow at night", () => {
    expect(carLightGain(1)).toBeCloseTo(0.5, 6); // full day: faint accent
    expect(carLightGain(0)).toBeCloseTo(1.1, 6); // night: gentle glow, barely HDR
  });

  it("ramps linearly across dusk", () => {
    expect(carLightGain(0.5)).toBeCloseTo(0.8, 6);
  });

  it("clamps out-of-range day factors", () => {
    expect(carLightGain(2)).toBeCloseTo(0.5, 6);
    expect(carLightGain(-1)).toBeCloseTo(1.1, 6);
  });

  it("is monotonic: darker day means brighter lamps", () => {
    expect(carLightGain(0.2)).toBeGreaterThan(carLightGain(0.8));
  });
});
