import { describe, it, expect } from "vitest";
import { webmercatorToLonLat } from "../src/coords/webmercator";

describe("webmercatorToLonLat", () => {
  it("round-trips Toronto City Hall to lon/lat within 1e-6 deg", () => {
    // Toronto City Hall approx: 43.6534° N, 79.3839° W
    // Forward: lon/lat -> 3857
    const R = 6378137;
    const lon = -79.3839;
    const lat = 43.6534;
    const x = lon * (Math.PI / 180) * R;
    const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;

    const [outLon, outLat] = webmercatorToLonLat(x, y);
    expect(Math.abs(outLon - lon)).toBeLessThan(1e-6);
    expect(Math.abs(outLat - lat)).toBeLessThan(1e-6);
  });

  it("handles the prime meridian", () => {
    const [lon, lat] = webmercatorToLonLat(0, 0);
    expect(Math.abs(lon)).toBeLessThan(1e-10);
    expect(Math.abs(lat)).toBeLessThan(1e-10);
  });
});
