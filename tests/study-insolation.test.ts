import { describe, it, expect } from "vitest";
import { computeInsolation, sunVisibleAt } from "../src/study/insolation";
import { buildHeightfield, type HeightfieldSpec } from "../src/study/heightfield";
import type { AnalysisRegion, SunHoursSample } from "../src/study/studyTypes";

const spec: HeightfieldSpec = {
  originE: -5,
  originN: -5,
  cellSize: 1,
  width: 30,
  height: 30,
};

// A 50 m wall just east of the origin, spanning a few cells around (10, 0).
const wallField = buildHeightfield(
  [
    {
      footprint: [
        [
          [9, -1],
          [11, -1],
          [11, 1],
          [9, 1],
          [9, -1],
        ],
      ],
      height: 50,
    },
  ],
  spec
);

// Direction toward the sun, Three space [east, up, -north]; pointing due east at a
// given altitude. Low east sun is blocked by the wall, steep sun clears it.
function eastSun(altDeg: number): [number, number, number] {
  const a = (altDeg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), 0];
}

function sample(dir: [number, number, number], weight = 1): SunHoursSample {
  return {
    minutesOfDay: 720,
    altitudeDeg: 45,
    azimuthDeg: 90,
    dir,
    contributes: true,
    weightHours: weight,
  };
}

// A single-texel region sitting at the origin, west of the wall.
const point: AnalysisRegion = {
  id: "p",
  name: "p",
  kind: "rect",
  center: [0, 0],
  halfExtents: [0.5, 0.5],
  rotationRad: 0,
  source: "placed",
};

describe("sunVisibleAt", () => {
  it("is occluded by a wall along the low sun track and clear when steep", () => {
    expect(sunVisibleAt(wallField, 0, 0, eastSun(10))).toBe(false);
    expect(sunVisibleAt(wallField, 0, 0, eastSun(80))).toBe(true);
  });

  it("treats a sun at or below the horizon as not visible", () => {
    expect(sunVisibleAt(wallField, 0, 0, [1, 0, 0])).toBe(false);
    expect(sunVisibleAt(wallField, 0, 0, [1, -0.2, 0])).toBe(false);
  });

  it("is always lit over an empty field", () => {
    const empty = buildHeightfield([], spec);
    expect(sunVisibleAt(empty, 0, 0, eastSun(10))).toBe(true);
  });
});

describe("computeInsolation", () => {
  it("counts only the unoccluded samples at a shadowed point", () => {
    const field = computeInsolation(point, 1, wallField, [
      sample(eastSun(10)), // blocked by the wall
      sample(eastSun(80)), // clears the wall
    ]);
    expect(field.width).toBe(1);
    expect(field.maxPossibleHours).toBeCloseTo(2, 6);
    expect(field.hours[0]).toBeCloseTo(1, 6); // only the steep sample reaches
  });

  it("a fully open region collects every sample's hours", () => {
    const empty = buildHeightfield([], spec);
    const field = computeInsolation(point, 4, empty, [
      sample(eastSun(20), 0.5),
      sample(eastSun(60), 0.5),
    ]);
    for (const h of field.hours) expect(h).toBeCloseTo(1, 6);
  });

  it("ignores samples that do not contribute", () => {
    const dark: SunHoursSample = {
      minutesOfDay: 1140,
      altitudeDeg: 4,
      azimuthDeg: 270,
      dir: eastSun(4),
      contributes: false,
      weightHours: 0,
    };
    const field = computeInsolation(point, 1, wallField, [
      sample(eastSun(80)),
      dark,
    ]);
    expect(field.hours[0]).toBeCloseTo(1, 6);
  });
});
