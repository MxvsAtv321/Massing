import { describe, it, expect } from "vitest";
import { enuToThree, tubeRadiusForTrips, desireArc, gatewayMarkerPos } from "../src/scene/demandGeometry";

describe("enuToThree", () => {
  it("maps ENU [east, north] to Three [x=east, y, z=-north]", () => {
    const v = enuToThree(10, 20, 0.2);
    expect([v.x, v.y, v.z]).toEqual([10, 0.2, -20]);
  });
});

describe("tubeRadiusForTrips", () => {
  it("grows with trips and clamps at 6 m", () => {
    expect(tubeRadiusForTrips(0)).toBeCloseTo(1.2, 5);
    expect(tubeRadiusForTrips(800)).toBeGreaterThan(tubeRadiusForTrips(100));
    expect(tubeRadiusForTrips(1_000_000)).toBe(6);
  });
});

describe("desireArc", () => {
  const from: [number, number] = [0, 0];
  const to: [number, number] = [200, 0];
  const curve = desireArc(from, to);

  it("starts and ends near the endpoints (with a small right-hand offset)", () => {
    const start = curve.getPoint(0);
    const end = curve.getPoint(1);
    // x close to the ENU east of each endpoint
    expect(Math.abs(start.x - 0)).toBeLessThan(1);
    expect(Math.abs(end.x - 200)).toBeLessThan(1);
    // endpoints sit just above the ground
    expect(start.y).toBeLessThan(1);
    expect(end.y).toBeLessThan(1);
  });

  it("lifts the apex above the endpoints", () => {
    const mid = curve.getPoint(0.5);
    expect(mid.y).toBeGreaterThan(curve.getPoint(0).y + 5);
  });

  it("offsets opposing directions to opposite sides", () => {
    const back = desireArc(to, from);
    // The two arcs' midpoints sit on opposite sides (different -Z), so they do not overlap.
    expect(Math.abs(curve.getPoint(0.5).z - back.getPoint(0.5).z)).toBeGreaterThan(1);
  });
});

describe("gatewayMarkerPos", () => {
  it("places the marker at the ENU position, raised in Y", () => {
    const v = gatewayMarkerPos([50, -30]);
    expect(v.x).toBe(50);
    expect(v.z).toBe(30);
    expect(v.y).toBeGreaterThan(0);
  });
});
