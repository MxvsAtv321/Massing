import { describe, it, expect } from "vitest";
import {
  polylineLengthEnu,
  haversineLengthLonLat,
  reprojectPolyline,
  enuToLonLat,
} from "../src/network/geometry";

const LON0 = -79.375;
const LAT0 = 43.65;

describe("polylineLengthEnu", () => {
  it("sums segment lengths (3-4 right angle = 7)", () => {
    expect(polylineLengthEnu([[0, 0], [3, 0], [3, 4]])).toBeCloseTo(7, 9);
  });

  it("is zero for a single point", () => {
    expect(polylineLengthEnu([[5, 5]])).toBe(0);
  });
});

describe("haversineLengthLonLat", () => {
  it("measures ~111.3 m for 0.001 deg of latitude", () => {
    const d = haversineLengthLonLat([
      [LON0, LAT0],
      [LON0, LAT0 + 0.001],
    ]);
    expect(Math.abs(d - 111.32)).toBeLessThan(1);
  });
});

describe("reprojectPolyline and enuToLonLat", () => {
  it("maps the origin to [0, 0]", () => {
    const [[e, n]] = reprojectPolyline([[LON0, LAT0]], LON0, LAT0);
    expect(Math.abs(e)).toBeLessThan(1e-6);
    expect(Math.abs(n)).toBeLessThan(1e-6);
  });

  it("round-trips lon/lat -> ENU -> lon/lat", () => {
    const lon = -79.372;
    const lat = 43.6485;
    const [[e, n]] = reprojectPolyline([[lon, lat]], LON0, LAT0);
    const [lon2, lat2] = enuToLonLat(e, n, LON0, LAT0);
    expect(Math.abs(lon2 - lon)).toBeLessThan(1e-9);
    expect(Math.abs(lat2 - lat)).toBeLessThan(1e-9);
  });

  it("ENU length agrees with geodesic length to better than 0.1%", () => {
    const lonlat: [number, number][] = [
      [LON0, LAT0],
      [LON0 + 0.003, LAT0 + 0.001],
      [LON0 + 0.004, LAT0 + 0.004],
    ];
    const enu = reprojectPolyline(lonlat, LON0, LAT0);
    const enuLen = polylineLengthEnu(enu);
    const geoLen = haversineLengthLonLat(lonlat);
    expect(Math.abs(enuLen - geoLen) / geoLen).toBeLessThan(0.001);
  });
});
