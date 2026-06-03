import { MIN_SUN_ALTITUDE_DEG } from "../solar/sun";

// Shadow band: L = h / tan(alt), band = sigma / tan(alt).
// Returns null when altitude is below the usable threshold (refuse false precision).
// All returned lengths are whole metres (Math.round).
export function computeShadowBand(
  heightM: number,
  sigma_m: number,
  altitudeDeg: number
): { mid: number; low: number; high: number } | null {
  if (altitudeDeg < MIN_SUN_ALTITUDE_DEG) return null;
  const tanAlt = Math.tan((altitudeDeg * Math.PI) / 180);
  const L = heightM / tanAlt;
  const spread = sigma_m / tanAlt;
  return {
    mid: Math.round(L),
    low: Math.round(L - spread),
    high: Math.round(L + spread),
  };
}
