import { DateTime } from "luxon";

// Convert a Toronto wall-clock time to a UTC Date.
// Uses luxon with zone 'America/Toronto'; DST transitions are handled automatically.
// EDT (UTC-4) is active from mid-March to early November.
// EST (UTC-5) is active the rest of the year.
// Never constructs a Date from a local string. Never reads the client locale.
export function toTorontoUtc(
  isoDate: string,   // "YYYY-MM-DD"
  hour: number,      // 0-23
  minute: number     // 0-59
): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: "America/Toronto" }
  );
  if (!dt.isValid) {
    throw new Error(
      `Invalid Toronto time: ${isoDate} ${hour}:${String(minute).padStart(2, "0")} — ${dt.invalidExplanation}`
    );
  }
  return dt.toJSDate();
}

// Format a UTC Date as a Toronto local time string for display.
// Returns e.g. "2:30 PM EDT" or "2:30 PM EST".
export function formatTorontoTime(utcDate: Date): string {
  const dt = DateTime.fromJSDate(utcDate, { zone: "America/Toronto" });
  const time = dt.toFormat("h:mm a");
  const abbr = dt.toFormat("ZZZZ"); // EDT or EST
  return `${time} ${abbr}`;
}

// Format a UTC Date as a full Toronto date+time string for the export footer.
// Returns e.g. "2026-06-03 2:32 PM EDT".
export function formatTorontoDateTime(utcDate: Date): string {
  const dt = DateTime.fromJSDate(utcDate, { zone: "America/Toronto" });
  return `${dt.toFormat("yyyy-MM-dd")} ${dt.toFormat("h:mm a")} ${dt.toFormat("ZZZZ")}`;
}
