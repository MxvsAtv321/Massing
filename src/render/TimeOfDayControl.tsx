"use client";

import { dayClock, useDayClock } from "./dayClockStore";
import { studyState, useStudyState } from "./studyStore";
import { toTorontoUtcMinutes, formatTorontoTime } from "../solar/time";
import { MINUTES_PER_DAY } from "./dayClock";

// How long a full day takes in real seconds -> sim minutes per real second.
const SPEEDS = [
  { label: "60s", speed: MINUTES_PER_DAY / 60 },
  { label: "30s", speed: MINUTES_PER_DAY / 30 },
  { label: "12s", speed: MINUTES_PER_DAY / 12 },
  { label: "4s", speed: MINUTES_PER_DAY / 4 },
];

// Season presets for the date control. The autumn equinox is the Toronto
// shadow-study date the sun-access study runs on; the others bracket the year.
const DATES = [
  { label: "Mar 20", date: "2026-03-20" }, // spring equinox
  { label: "Jun 21", date: "2026-06-21" }, // summer solstice
  { label: "Sep 21", date: "2026-09-21" }, // autumn equinox (bylaw)
  { label: "Dec 21", date: "2026-12-21" }, // winter solstice
];

// DOM overlay to scrub and play the time of day. Dev-grade for now; folds into
// the real HUD when the editor UI lands. Lives outside the canvas and talks to
// the same clock the canvas advances (dayClockStore).
export function TimeOfDayControl() {
  const { minutes, playing, speed } = useDayClock();
  const { date } = useStudyState();
  const label = formatTorontoTime(toTorontoUtcMinutes(date, minutes));

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        borderRadius: 999,
        background: "rgba(16, 18, 22, 0.66)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#e6e8ec",
        font: "12px ui-monospace, SFMono-Regular, monospace",
        letterSpacing: "0.03em",
        userSelect: "none",
      }}
    >
      <select
        value={date}
        onChange={(e) => studyState.setDate(e.target.value)}
        aria-label="Study date"
        title="Date of year (the equinox is the Toronto shadow-study date)"
        style={{
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 7,
          color: "#f0e2cf",
          font: "inherit",
          padding: "2px 6px",
          cursor: "pointer",
        }}
      >
        {DATES.map((d) => (
          <option key={d.date} value={d.date} style={{ color: "#101216" }}>
            {d.label}
          </option>
        ))}
      </select>

      <button
        onClick={() => dayClock.setPlaying(!playing)}
        aria-label={playing ? "Pause" : "Play"}
        style={btnStyle}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <input
        type="range"
        min={0}
        max={MINUTES_PER_DAY}
        step={1}
        value={Math.floor(minutes)}
        onChange={(e) => {
          dayClock.setPlaying(false);
          dayClock.setMinutes(Number(e.target.value));
        }}
        style={{ width: 220, accentColor: "#d79a52" }}
      />

      <span style={{ minWidth: 86, textAlign: "right", color: "#f0e2cf" }}>
        {label}
      </span>

      <div style={{ display: "flex", gap: 4 }}>
        {SPEEDS.map((s) => (
          <button
            key={s.label}
            onClick={() => dayClock.setSpeed(s.speed)}
            style={{
              ...btnStyle,
              padding: "2px 7px",
              color:
                Math.abs(speed - s.speed) < 1e-6 ? "#d79a52" : "rgba(230,232,236,0.6)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#e6e8ec",
  font: "inherit",
  cursor: "pointer",
  padding: "2px 6px",
  lineHeight: 1,
};
