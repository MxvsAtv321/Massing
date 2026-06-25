import { describe, it, expect } from "vitest";
import { buildSampleTimes } from "../src/study/sampleWindow";
import { defaultStudyConfig } from "../src/study/studyTypes";

describe("buildSampleTimes", () => {
  it("covers the 9:18-18:18 window at 20 minutes as 28 inclusive samples", () => {
    const cfg = defaultStudyConfig("webgpu");
    const t = buildSampleTimes(cfg);
    expect(t.length).toBe(28);
    expect(t[0]).toBe(558); // 9:18
    expect(t[t.length - 1]).toBe(1098); // 18:18
  });

  it("uses the coarser fallback step", () => {
    const cfg = defaultStudyConfig("webgl2");
    const t = buildSampleTimes(cfg);
    expect(t.length).toBe(13); // 540 / 45 = 12 intervals
    expect(t[0]).toBe(558);
    expect(t[t.length - 1]).toBe(1098);
  });

  it("always includes the end even when the step does not divide evenly", () => {
    const t = buildSampleTimes({
      isoDate: "2026-09-21",
      windowStartMin: 600,
      windowEndMin: 700,
      stepMin: 30,
      resolution: 256,
    });
    expect(t[0]).toBe(600);
    expect(t[t.length - 1]).toBe(700);
    expect(t).toEqual([600, 630, 660, 690, 700]);
  });

  it("returns a single sample for a degenerate window", () => {
    const t = buildSampleTimes({
      isoDate: "2026-09-21",
      windowStartMin: 720,
      windowEndMin: 720,
      stepMin: 20,
      resolution: 256,
    });
    expect(t).toEqual([720]);
  });

  it("rejects an out-of-order window and a non-positive step", () => {
    expect(() =>
      buildSampleTimes({
        isoDate: "2026-09-21",
        windowStartMin: 700,
        windowEndMin: 600,
        stepMin: 20,
        resolution: 256,
      })
    ).toThrow();
    expect(() =>
      buildSampleTimes({
        isoDate: "2026-09-21",
        windowStartMin: 600,
        windowEndMin: 700,
        stepMin: 0,
        resolution: 256,
      })
    ).toThrow();
  });
});
