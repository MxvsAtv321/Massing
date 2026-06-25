"use client";

import { useStudyState } from "./studyStore";
import { meanSunHours, sunlitFraction } from "../study/sunHours";
import { SUNLIT_MIN_HOURS } from "../study/netNewShadow";

// The sun-access study readout (Unit 8, increment 8.4). Shows the region, the bylaw
// date and window, and once a study has run the mean direct-sun hours and the sunlit
// fraction. The register is deliberate (ADR-R16): real heights, real sun, stated as a
// live exploratory study, with the window and date always visible so the number is
// legible and falsifiable. No badge, no pass/fail verdict.
export function StudyPanel() {
  const { status, field, date, region } = useStudyState();
  const ready = status === "ready" && field !== null;
  const mean = ready ? meanSunHours(field) : 0;
  const max = field ? field.maxPossibleHours : 9;
  const lit = ready ? sunlitFraction(field, SUNLIT_MIN_HOURS) : 0;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        minWidth: 184,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 14px",
        borderRadius: 12,
        background: "rgba(14, 18, 26, 0.62)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(120, 190, 255, 0.18)",
        color: "#dfe8f2",
        font: "12px ui-monospace, SFMono-Regular, monospace",
        letterSpacing: "0.02em",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div style={{ fontWeight: 600, letterSpacing: "0.10em", opacity: 0.85 }}>
        SUN-ACCESS STUDY
      </div>
      <div style={{ opacity: 0.6 }}>{region.name}</div>
      <div style={{ opacity: 0.6 }}>{date} · 9:18–18:18</div>

      {status === "idle" && (
        <div style={{ marginTop: 2 }}>
          press <b style={{ color: "#8fc7ff" }}>U</b> to run
        </div>
      )}
      {status === "running" && <div style={{ marginTop: 2 }}>computing…</div>}
      {ready && (
        <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          <div>
            Direct sun <b style={{ color: "#ffcf8a" }}>{mean.toFixed(1)} h</b>
            <span style={{ opacity: 0.5 }}> of {max.toFixed(1)} h</span>
          </div>
          <div>
            Sunlit area <b style={{ color: "#ffcf8a" }}>{Math.round(lit * 100)}%</b>
          </div>
        </div>
      )}

      <div style={{ opacity: 0.4, fontSize: 10.5, marginTop: 4 }}>
        measured geometry · real sun · exploratory
      </div>
    </div>
  );
}
