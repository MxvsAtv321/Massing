import { lonLatToEnu } from "../coords/enu";

// WGS84 semi-major axis, the same radius the ENU transform uses (src/coords/enu.ts).
// Using one radius for both keeps the gate's geometry check about the tangent-plane
// approximation itself, not a radius mismatch.
const R = 6378137;
const DEG2RAD = Math.PI / 180;

// Reproject a lon/lat polyline to ENU [east, north] metres using the shared city origin.
export function reprojectPolyline(
  lonlat: [number, number][],
  lon0: number,
  lat0: number
): [number, number][] {
  return lonlat.map(([lon, lat]) => lonLatToEnu(lon, lat, lon0, lat0));
}

// Inverse of the ENU transform: recover lon/lat from local ENU metres. Used by the gate
// to compute an independent geodesic length for each edge from its ENU geometry.
export function enuToLonLat(
  east: number,
  north: number,
  lon0: number,
  lat0: number
): [number, number] {
  const lon = lon0 + east / (DEG2RAD * R * Math.cos(lat0 * DEG2RAD));
  const lat = lat0 + north / (DEG2RAD * R);
  return [lon, lat];
}

// Sum of segment lengths of an ENU polyline, in metres.
export function polylineLengthEnu(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    total += Math.hypot(dx, dy);
  }
  return total;
}

// Great-circle (haversine) length of a lon/lat polyline, in metres. Independent of the
// ENU transform; the gate compares this against the ENU-computed length per edge.
export function haversineLengthLonLat(lonlat: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < lonlat.length; i++) {
    const [lon1, lat1] = lonlat[i - 1];
    const [lon2, lat2] = lonlat[i];
    const dLat = (lat2 - lat1) * DEG2RAD;
    const dLon = (lon2 - lon1) * DEG2RAD;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}
