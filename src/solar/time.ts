import { DateTime } from "luxon";

// Wall-clock time math in a per-city IANA zone (the manifest's ianaZone). DST transitions are handled
// by luxon. Never constructs a Date from a local string, never reads the client locale. The zone is a
// parameter, not a constant, so the same math serves any ingested city (I0).

// Convert a wall-clock time in the given zone to a UTC Date.
export function toZonedUtc(
  isoDate: string, // "YYYY-MM-DD"
  hour: number, // 0-23
  minute: number, // 0-59
  zone: string // IANA zone, e.g. "America/Toronto"
): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone }
  );
  if (!dt.isValid) {
    throw new Error(
      `Invalid zoned time: ${isoDate} ${hour}:${String(minute).padStart(2, "0")} in ${zone}: ${dt.invalidExplanation}`
    );
  }
  return dt.toJSDate();
}

// Convert a fractional minutes-of-day position (the live clock) to a UTC Date in the given zone.
// Sub-minute precision keeps the sun smooth at high time speed.
export function toZonedUtcMinutes(isoDate: string, minutesOfDay: number, zone: string): Date {
  const clamped = ((minutesOfDay % 1440) + 1440) % 1440;
  const hour = Math.floor(clamped / 60);
  const minute = Math.floor(clamped % 60);
  const second = Math.floor((clamped * 60) % 60);
  const [year, month, day] = isoDate.split("-").map(Number);
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second, millisecond: 0 },
    { zone }
  );
  if (!dt.isValid) {
    throw new Error(
      `Invalid zoned time: ${isoDate} ${minutesOfDay}min in ${zone}: ${dt.invalidExplanation}`
    );
  }
  return dt.toJSDate();
}

// Format a UTC Date as a local time string in the given zone, e.g. "2:30 PM EDT" or "2:30 PM EST".
export function formatZonedTime(utcDate: Date, zone: string): string {
  const dt = DateTime.fromJSDate(utcDate, { zone });
  const time = dt.toFormat("h:mm a");
  const abbr = dt.toFormat("ZZZZ"); // EDT or EST
  return `${time} ${abbr}`;
}

// Format a UTC Date as a full local date+time string in the given zone, e.g. "2026-06-03 2:32 PM EDT".
export function formatZonedDateTime(utcDate: Date, zone: string): string {
  const dt = DateTime.fromJSDate(utcDate, { zone });
  return `${dt.toFormat("yyyy-MM-dd")} ${dt.toFormat("h:mm a")} ${dt.toFormat("ZZZZ")}`;
}
