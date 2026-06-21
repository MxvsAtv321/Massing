import { computeSunDir } from "../solar/sun";
import { toTorontoUtc } from "../solar/time";

// Fixed art-directed golden-hour instant for Unit 1. Time of day goes live in
// Unit 3; until then the sun is parked here for a low, warm, long-shadow look.
export const GOLDEN_HOUR = { date: "2026-06-21", hour: 19, minute: 15 } as const;

export type SunInstant = {
  dir: [number, number, number]; // unit, ground -> sun, Three space
  altitude: number; // degrees, refraction included
  azimuth: number; // degrees, 0=N 90=E 180=S 270=W
  utc: Date;
};

// Extracts plain numbers from the kept solar core so nothing crosses the
// three / three-webgpu module boundary as a class instance.
export function goldenHourSun(originLatLon: [number, number]): SunInstant {
  const utc = toTorontoUtc(GOLDEN_HOUR.date, GOLDEN_HOUR.hour, GOLDEN_HOUR.minute);
  const r = computeSunDir(utc, originLatLon);
  return {
    dir: [r.sunDir.x, r.sunDir.y, r.sunDir.z],
    altitude: r.altitude,
    azimuth: r.azimuth,
    utc,
  };
}
