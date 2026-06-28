// Spherical Web Mercator (EPSG:3857) projection, forward and inverse.
// R is the WGS84 semi-major axis used by the spherical variant of the projection.
const R = 6378137;
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export function webmercatorToLonLat(x: number, y: number): [number, number] {
  const lon = (x / R) * RAD2DEG;
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * RAD2DEG;
  return [lon, lat];
}

// Forward projection, for ingestion (I4): OSM/city footprints arrive in lon/lat and are baked as 3857
// so the loader's existing 3857 -> lon/lat -> ENU path consumes them unchanged. Round-trips with the
// inverse above.
export function lonLatToWebmercator(lon: number, lat: number): [number, number] {
  const x = lon * DEG2RAD * R;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG2RAD) / 2));
  return [x, y];
}
