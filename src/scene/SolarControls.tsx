"use client";

import type { CSSProperties } from "react";
import { formatTorontoTime } from "../solar/time";
import type { SunDriverState } from "./useSunDriver";
import { c, font, radius, ghostButton } from "../ui/theme";

type Props = {
  sun: SunDriverState;
};

const DATE_PRESETS = [
  { label: "Jun 21", date: "2026-06-21" },
  { label: "Mar 20", date: "2026-03-20" },
  { label: "Sep 23", date: "2026-09-23" },
  { label: "Dec 21", date: "2026-12-21" },
];

function minuteLabel(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

// Track painted as a day arc: night to dawn to noon to dusk to night.
const SUN_TRACK =
  "linear-gradient(90deg, #191c2b 0%, #191c2b 20%, #6a4a2a 27%, #f4a93a 50%, #6a4a2a 73%, #191c2b 80%, #191c2b 100%)";

export function SolarControls({ sun }: Props) {
  const { isoDate, minuteOfDay, altitude, azimuth, isUsable, utcDate, setDate, setMinuteOfDay } = sun;
  const timeStr = formatTorontoTime(utcDate);

  return (
    <div className="panel-rise" style={styles.panel}>
      <div style={styles.readoutRow}>
        <span style={styles.bigTime}>{minuteLabel(minuteOfDay)}</span>
        <span style={styles.zone}>{timeStr.replace(minuteLabel(minuteOfDay), "").trim() || "America/Toronto"}</span>
      </div>
      <div style={styles.sunline}>
        {isUsable ? (
          <>
            <span style={styles.sunMetric}>alt <b style={styles.sunNum}>{altitude.toFixed(1)}&deg;</b></span>
            <span style={styles.dotSep}>&middot;</span>
            <span style={styles.sunMetric}>az <b style={styles.sunNum}>{azimuth.toFixed(1)}&deg;</b></span>
          </>
        ) : (
          <span style={styles.lowSun}>{altitude < 0 ? "night" : "low sun, shadow not computed"}</span>
        )}
      </div>

      <div style={styles.sliderRow}>
        <span style={styles.endLabel}>12a</span>
        <input
          type="range"
          min={0}
          max={1439}
          value={minuteOfDay}
          onChange={(e) => setMinuteOfDay(Number(e.target.value))}
          style={{ ...styles.slider, background: SUN_TRACK }}
          aria-label="Time of day"
        />
        <span style={styles.endLabel}>12p</span>
      </div>

      <div style={styles.dateRow}>
        {DATE_PRESETS.map((p) => {
          const active = isoDate === p.date;
          return (
            <button
              key={p.date}
              onClick={() => setDate(p.date)}
              style={{ ...styles.preset, ...(active ? styles.presetActive : {}) }}
            >
              {p.label}
            </button>
          );
        })}
        <input
          type="date"
          value={isoDate}
          onChange={(e) => setDate(e.target.value)}
          style={styles.dateInput}
          aria-label="Date"
        />
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: "fixed",
    bottom: 22,
    left: "50%",
    transform: "translateX(-50%)",
    background: c.surface,
    backdropFilter: "var(--blur)",
    WebkitBackdropFilter: "var(--blur)",
    border: `1px solid ${c.hairline}`,
    borderRadius: radius.md,
    boxShadow: "var(--shadow), inset 0 1px 0 rgba(255,255,255,0.05)",
    padding: "12px 20px 14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 7,
    minWidth: 380,
    zIndex: 10,
    userSelect: "none",
  },
  readoutRow: { display: "flex", alignItems: "baseline", gap: 9 },
  bigTime: {
    fontFamily: font.display,
    fontSize: 27,
    fontWeight: 500,
    color: c.ink,
    lineHeight: 1,
    letterSpacing: "-0.01em",
    fontVariantNumeric: "tabular-nums",
  },
  zone: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: c.ink3,
  },
  sunline: { display: "flex", alignItems: "center", gap: 8, marginTop: -2 },
  sunMetric: { fontFamily: font.sans, fontSize: 11, color: c.ink3 },
  sunNum: { fontFamily: font.mono, fontWeight: 500, color: c.ink2, fontVariantNumeric: "tabular-nums" },
  dotSep: { color: c.hairline2 },
  lowSun: { fontFamily: font.sans, fontSize: 11, color: c.estimated, fontStyle: "italic" },
  sliderRow: { display: "flex", alignItems: "center", gap: 10, width: "100%", marginTop: 2 },
  slider: { flex: 1 },
  endLabel: {
    fontFamily: font.mono,
    fontSize: 9.5,
    color: c.ink3,
    width: 22,
    textAlign: "center",
    flexShrink: 0,
  },
  dateRow: { display: "flex", gap: 6, alignItems: "center", marginTop: 3 },
  preset: { ...ghostButton, padding: "4px 9px", fontSize: 11 },
  presetActive: {
    background: c.accentSoft,
    borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
    color: c.accent,
  },
  dateInput: {
    fontFamily: font.mono,
    fontSize: 11,
    color: c.ink2,
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${c.hairline}`,
    borderRadius: radius.sm,
    padding: "3px 7px",
    cursor: "pointer",
    colorScheme: "dark",
  },
};
