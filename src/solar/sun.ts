import { Observer, Equator, Horizon, Body } from "astronomy-engine";
import * as THREE from "three";

// Below this apparent altitude, shadow lengths are unreliable (h / tan(alt) blows up).
// The scene stops driving shadows and shows a "low sun" indicator instead.
export const MIN_SUN_ALTITUDE_DEG = 8;

const DEG2RAD = Math.PI / 180;

// Average ground elevation across the St. Lawrence clip, in metres above sea level.
// Used as the observer height for astronomy-engine (minor effect on results).
const OBSERVER_HEIGHT_M = 76;

export type SunResult = {
  sunDir: THREE.Vector3; // unit vector FROM ground TOWARD sun, in Three.js space
  altitude: number;      // apparent altitude in degrees (refraction included)
  azimuth: number;       // azimuth in degrees, 0=N, 90=E, 180=S, 270=W
  isUsable: boolean;     // false below MIN_SUN_ALTITUDE_DEG or below horizon
};

// Compute the sun direction for a given UTC instant and observer location.
// Uses astronomy-engine with refraction='normal' (ADR-003).
//
// Axis mapping (matches Part 2 buildings.ts):
//   ENU east  -> Three.js +X
//   ENU north -> Three.js -Z
//   ENU up    -> Three.js +Y
//
// Sun unit vector (pointing from ground toward sun):
//   x =  cos(alt) * sin(az)    east component  -> Three.js +X
//   y =  sin(alt)              up component    -> Three.js +Y
//   z = -cos(alt) * cos(az)   -north component -> Three.js -Z
//
// At solar noon az=180, so z = -cos(alt)*cos(180) = +cos(alt) > 0.
// The SHADOW falls opposite to the sun's horizontal direction: anti-sun z = -cos(alt)*(-1) = no...
// More simply: shadow direction = -sunDir.xz normalized, which at noon is -z = south... wait.
// sunDir.z at noon = +cos(alt) (sun is due south of observer, i.e. in the +Z hemisphere).
// The horizontal shadow direction = (-sunDir.x, -sunDir.z) normalized = (0, -cos(alt)) -> z = -1
// -> shadow falls in the -Z direction = north in Three.js. Correct.
export function computeSunDir(
  utcDate: Date,
  originLatLon: [number, number]
): SunResult {
  // originLatLon is stored [lon, lat] (GeoJSON/loader convention).
  const [lon, lat] = originLatLon;
  const obs = new Observer(lat, lon, OBSERVER_HEIGHT_M);

  // ofDate=true, aberration=true: full apparent position including annual aberration.
  const eq = Equator(Body.Sun, utcDate, obs, true, true);

  // 'normal': atmospheric refraction per Meeus "Astronomical Algorithms".
  const hor = Horizon(utcDate, obs, eq.ra, eq.dec, "normal");

  const { altitude, azimuth } = hor;
  const isUsable = altitude >= MIN_SUN_ALTITUDE_DEG;

  const altRad = altitude * DEG2RAD;
  const azRad = azimuth * DEG2RAD;

  const x = Math.cos(altRad) * Math.sin(azRad);
  const y = Math.sin(altRad);
  const z = -Math.cos(altRad) * Math.cos(azRad);

  const sunDir = new THREE.Vector3(x, y, z).normalize();

  return { sunDir, altitude, azimuth, isUsable };
}

// Pure formula helper for unit tests, decoupled from astronomy-engine.
export function sunDirFromAltAz(
  altDeg: number,
  azDeg: number
): { sunDir: THREE.Vector3; isUsable: boolean } {
  const altRad = altDeg * DEG2RAD;
  const azRad = azDeg * DEG2RAD;
  const x = Math.cos(altRad) * Math.sin(azRad);
  const y = Math.sin(altRad);
  const z = -Math.cos(altRad) * Math.cos(azRad);
  return {
    sunDir: new THREE.Vector3(x, y, z).normalize(),
    isUsable: altDeg >= MIN_SUN_ALTITUDE_DEG,
  };
}
