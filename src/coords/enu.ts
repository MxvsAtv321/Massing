// Equirectangular tangent-plane transform from geodetic lon/lat to local ENU metres.
// Origin is anchored at (lon0, lat0). The cos(lat0) factor removes Web Mercator's
// horizontal distortion (~1.38x at Toronto's latitude) and produces true ground metres.
const R = 6378137;
const DEG2RAD = Math.PI / 180;

export function lonLatToEnu(
  lon: number,
  lat: number,
  lon0: number,
  lat0: number
): [number, number] {
  const east = (lon - lon0) * DEG2RAD * R * Math.cos(lat0 * DEG2RAD);
  const north = (lat - lat0) * DEG2RAD * R;
  return [east, north];
}
