import { describe, it, expect } from "vitest";
import { nearestCentroid, nearestStreetBearingDeg } from "../src/generate/placement";

describe("nearestCentroid", () => {
  it("returns the cluster centroid closest to the point", () => {
    const centroids = { a: [0, 0] as [number, number], b: [100, 0] as [number, number], c: [10, 5] as [number, number] };
    expect(nearestCentroid(centroids, [8, 4])).toEqual([10, 5]);
    expect(nearestCentroid(centroids, [90, 1])).toEqual([100, 0]);
  });

  it("returns null when there are no centroids", () => {
    expect(nearestCentroid({}, [0, 0])).toBeNull();
  });
});

describe("nearestStreetBearingDeg", () => {
  it("reads the bearing of the nearest segment, normalized to 0..360", () => {
    const eastWest = [{ path: [[0, 0], [10, 0]] as [number, number][] }];
    const northSouth = [{ path: [[0, 0], [0, 10]] as [number, number][] }];
    expect(nearestStreetBearingDeg(eastWest, [5, 1])).toBeCloseTo(0, 6);
    expect(nearestStreetBearingDeg(northSouth, [1, 5])).toBeCloseTo(90, 6);
  });

  it("picks the nearer of two streets", () => {
    const streets = [
      { path: [[0, 0], [10, 0]] as [number, number][] }, // east-west, far
      { path: [[100, 0], [100, 10]] as [number, number][] }, // north-south, near (100,5)
    ];
    expect(nearestStreetBearingDeg(streets, [100, 5])).toBeCloseTo(90, 6);
  });

  it("returns null with no streets", () => {
    expect(nearestStreetBearingDeg([], [0, 0])).toBeNull();
  });
});
