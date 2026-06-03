// Spherical Web Mercator (EPSG:3857) inverse projection.
// R is the WGS84 semi-major axis used by the spherical variant of the projection.
const R = 6378137;
const RAD2DEG = 180 / Math.PI;

export function webmercatorToLonLat(x: number, y: number): [number, number] {
  const lon = (x / R) * RAD2DEG;
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * RAD2DEG;
  return [lon, lat];
}
