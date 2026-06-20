import { describe, it, expect } from "vitest";
import { sampleAlongPolyline, particleCountForVolume } from "../src/scene/particleGeometry";

describe("sampleAlongPolyline", () => {
  const straight: [number, number][] = [[0, 0], [10, 0]];

  it("returns the endpoints at t=0 and t=1", () => {
    expect(sampleAlongPolyline(straight, 0)).toEqual([0, 0]);
    expect(sampleAlongPolyline(straight, 1)).toEqual([10, 0]);
  });

  it("interpolates the midpoint", () => {
    expect(sampleAlongPolyline(straight, 0.5)).toEqual([5, 0]);
  });

  it("measures distance along a bent polyline, not straight-line", () => {
    // L-shape, total length 20; halfway (10) lands exactly on the corner.
    const bent: [number, number][] = [[0, 0], [10, 0], [10, 10]];
    expect(sampleAlongPolyline(bent, 0.5)).toEqual([10, 0]);
    expect(sampleAlongPolyline(bent, 0.75)).toEqual([10, 5]);
  });

  it("clamps t outside [0,1]", () => {
    expect(sampleAlongPolyline(straight, -1)).toEqual([0, 0]);
    expect(sampleAlongPolyline(straight, 2)).toEqual([10, 0]);
  });
});

describe("particleCountForVolume", () => {
  it("is zero for no volume and at least one for any load", () => {
    expect(particleCountForVolume(0)).toBe(0);
    expect(particleCountForVolume(10)).toBe(1);
  });

  it("grows with volume and caps", () => {
    expect(particleCountForVolume(1000)).toBeGreaterThan(particleCountForVolume(300));
    expect(particleCountForVolume(100000)).toBe(8);
  });
});
