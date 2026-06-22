// Pure time-of-day clock math. The clock is a position within a single day in
// minutes [0, 1440); the canvas advances it each frame and the kept astronomy
// engine turns it into a sun. No Date, no zone logic here (that lives in
// src/solar/time.ts); this is just the wrapping counter and its wall-clock view.

export const MINUTES_PER_DAY = 1440;

// Fold any minute value into a single day, including negatives (rewind).
export function wrapDay(minutes: number): number {
  const m = minutes % MINUTES_PER_DAY;
  return m < 0 ? m + MINUTES_PER_DAY : m;
}

// Advance by a real-time delta scaled by speed (sim minutes per real second),
// wrapping at the day boundary so the sun loops.
export function advanceMinutes(
  minutes: number,
  dtSeconds: number,
  speed: number
): number {
  return wrapDay(minutes + dtSeconds * speed);
}

// The wall-clock hour and minute for a clock position, for display and for
// feeding the zoned-time helper.
export function wallTime(minutes: number): { hour: number; minute: number } {
  const m = wrapDay(minutes);
  return { hour: Math.floor(m / 60), minute: Math.floor(m % 60) };
}
