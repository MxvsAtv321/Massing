"use client";

import { useState, useMemo } from "react";
import { toTorontoUtc } from "../solar/time";
import { computeSunDir, type SunResult } from "../solar/sun";

// Challenge year: 2026. Default to a clear summer afternoon in the challenge window.
const DEFAULT_ISO_DATE = "2026-06-14";
const DEFAULT_MINUTE_OF_DAY = 14 * 60; // 2:00 PM Toronto local

export type SunDriverState = SunResult & {
  isoDate: string;
  minuteOfDay: number;
  setDate: (d: string) => void;
  setMinuteOfDay: (m: number) => void;
  utcDate: Date;
};

export function useSunDriver(
  originLatLon: [number, number]
): SunDriverState {
  const [isoDate, setDate] = useState(DEFAULT_ISO_DATE);
  const [minuteOfDay, setMinuteOfDay] = useState(DEFAULT_MINUTE_OF_DAY);

  const result = useMemo(() => {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const utcDate = toTorontoUtc(isoDate, hour, minute);
    const sun = computeSunDir(utcDate, originLatLon);
    return { ...sun, utcDate };
  }, [isoDate, minuteOfDay, originLatLon[0], originLatLon[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...result,
    isoDate,
    minuteOfDay,
    setDate,
    setMinuteOfDay,
  };
}
