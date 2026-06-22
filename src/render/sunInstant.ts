import { computeSunDir } from "../solar/sun";
import { toTorontoUtc, toTorontoUtcMinutes } from "../solar/time";

// The art-directed golden-hour instant used as the clock's opening position
// (Unit 1 look). Time of day is live from Unit 3 on.
export const GOLDEN_HOUR = { date: "2026-06-21", hour: 19, minute: 15 } as const;

export type SunInstant = {
  dir: [number, number, number]; // unit, ground -> sun, Three space
  altitude: number; // degrees, refraction included
  azimuth: number; // degrees, 0=N 90=E 180=S 270=W
  utc: Date;
};

// The sun for a live clock position (fractional minutes of day) on a given date.
// Extracts plain numbers from the kept solar core so nothing crosses the
// three / three-webgpu module boundary as a class instance.
export function sunAtMinutes(
  originLatLon: [number, number],
  isoDate: string,
  minutesOfDay: number
): SunInstant {
  const utc = toTorontoUtcMinutes(isoDate, minutesOfDay);
  return fromUtc(utc, originLatLon);
}

// The fixed golden-hour sun, kept for the opening framing and any static use.
export function goldenHourSun(originLatLon: [number, number]): SunInstant {
  const utc = toTorontoUtc(GOLDEN_HOUR.date, GOLDEN_HOUR.hour, GOLDEN_HOUR.minute);
  return fromUtc(utc, originLatLon);
}

function fromUtc(utc: Date, originLatLon: [number, number]): SunInstant {
  const r = computeSunDir(utc, originLatLon);
  return {
    dir: [r.sunDir.x, r.sunDir.y, r.sunDir.z],
    altitude: r.altitude,
    azimuth: r.azimuth,
    utc,
  };
}
