"use client";

import { formatTorontoTime } from "../solar/time";
import type { SunDriverState } from "./useSunDriver";

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

export function SolarControls({ sun }: Props) {
  const {
    isoDate,
    minuteOfDay,
    altitude,
    azimuth,
    isUsable,
    utcDate,
    setDate,
    setMinuteOfDay,
  } = sun;

  const timeStr = formatTorontoTime(utcDate);

  return (
    <div style={styles.overlay}>
      {/* Readout */}
      <div style={styles.readout}>
        <span style={styles.timeLabel}>{timeStr}</span>
        {isUsable ? (
          <span style={styles.sunInfo}>
            {" "}alt&nbsp;{altitude.toFixed(1)}° az&nbsp;{azimuth.toFixed(1)}°
          </span>
        ) : (
          <span style={styles.lowSun}>
            {altitude < 0 ? " night" : " low sun"}
          </span>
        )}
      </div>

      {/* Time slider */}
      <div style={styles.sliderRow}>
        <span style={styles.sliderEndLabel}>12 AM</span>
        <input
          type="range"
          min={0}
          max={1439}
          value={minuteOfDay}
          onChange={(e) => setMinuteOfDay(Number(e.target.value))}
          style={styles.slider}
        />
        <span style={styles.sliderEndLabel}>11:59 PM</span>
      </div>
      <div style={styles.sliderCenterLabel}>{minuteLabel(minuteOfDay)}</div>

      {/* Date controls */}
      <div style={styles.dateRow}>
        {DATE_PRESETS.map((p) => (
          <button
            key={p.date}
            onClick={() => setDate(p.date)}
            style={{
              ...styles.presetBtn,
              ...(isoDate === p.date ? styles.presetBtnActive : {}),
            }}
          >
            {p.label}
          </button>
        ))}
        <input
          type="date"
          value={isoDate}
          onChange={(e) => setDate(e.target.value)}
          style={styles.dateInput}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(10,10,12,0.78)",
    backdropFilter: "blur(8px)",
    borderRadius: 12,
    padding: "10px 18px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    color: "#e8e0d0",
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    minWidth: 360,
    userSelect: "none",
    zIndex: 10,
  },
  readout: {
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: "0.02em",
  },
  timeLabel: {
    color: "#f5f0e8",
  },
  sunInfo: {
    color: "#a8c4e0",
    fontWeight: 400,
  },
  lowSun: {
    color: "#e09060",
    fontStyle: "italic",
    fontWeight: 400,
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  slider: {
    flex: 1,
    accentColor: "#f5b942",
    cursor: "pointer",
  },
  sliderEndLabel: {
    color: "#888",
    fontSize: 11,
    width: 36,
    textAlign: "center",
    flexShrink: 0,
  },
  sliderCenterLabel: {
    color: "#ccc",
    fontSize: 12,
    marginTop: -4,
  },
  dateRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  presetBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#c8c0b8",
    padding: "3px 9px",
    fontSize: 12,
    cursor: "pointer",
  },
  presetBtnActive: {
    background: "rgba(245,185,66,0.18)",
    border: "1px solid rgba(245,185,66,0.45)",
    color: "#f5e8c0",
  },
  dateInput: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#c8c0b8",
    padding: "3px 6px",
    fontSize: 12,
    cursor: "pointer",
    colorScheme: "dark",
  },
};
