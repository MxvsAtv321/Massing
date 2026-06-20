"use client";

import type { ValidationResult } from "../traffic/validation";

export type CountsProvenanceSlice = {
  dataset: string;
  source: string;
  retrievedDate: string;
};

function gehColor(geh: number): string {
  return geh < 5 ? "#45a05f" : geh < 10 ? "#d9a640" : "#d44f29";
}

// Compact simulated-vs-measured scatter against the y=x line. Points off the diagonal are
// disagreements, shown honestly.
function Scatter({ result }: { result: ValidationResult }) {
  const W = 230;
  const H = 150;
  const pad = 24;
  const max = Math.max(
    1,
    ...result.perStation.map((s) => Math.max(s.measured, s.simulated))
  );
  const sx = (v: number) => pad + (v / max) * (W - pad - 6);
  const sy = (v: number) => H - pad - (v / max) * (H - pad - 6);

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <line x1={pad} y1={H - pad} x2={W - 6} y2={H - pad} stroke="#555" strokeWidth={1} />
      <line x1={pad} y1={H - pad} x2={pad} y2={6} stroke="#555" strokeWidth={1} />
      {/* y = x reference */}
      <line x1={sx(0)} y1={sy(0)} x2={sx(max)} y2={sy(max)} stroke="#7ec8e3" strokeDasharray="3 3" strokeWidth={1} />
      {result.perStation.map((s) => (
        <circle key={s.id} cx={sx(s.measured)} cy={sy(s.simulated)} r={2.6} fill={gehColor(s.geh)} fillOpacity={0.85} />
      ))}
      <text x={W / 2} y={H - 6} fill="#888" fontSize={9} textAnchor="middle">measured veh/hr</text>
      <text x={9} y={H / 2} fill="#888" fontSize={9} textAnchor="middle" transform={`rotate(-90 9 ${H / 2})`}>simulated</text>
    </svg>
  );
}

export function ValidationReadout({
  validation,
  provenance,
  nStations,
}: {
  validation: ValidationResult | null;
  provenance: CountsProvenanceSlice;
  nStations: number;
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>Validation vs measured counts</div>

      {validation ? (
        <>
          <div style={styles.statRow}>
            <span style={styles.value}>{validation.medianGeh.toFixed(1)}</span>
            <span style={styles.label}>median GEH</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.value}>{validation.pctUnder5.toFixed(0)}%</span>
            <span style={styles.label}>within GEH&lt;5</span>
            <span style={styles.sep}>&middot;</span>
            <span style={styles.value}>{validation.pctUnder10.toFixed(0)}%</span>
            <span style={styles.label}>GEH&lt;10</span>
          </div>
          <div style={styles.sub}>
            {validation.nMatched} of {nStations} stations matched to the network
          </div>
          <Scatter result={validation} />
        </>
      ) : (
        <div style={styles.prompt}>
          {nStations} measured count stations loaded. Toggle Flow to score the simulation
          against them.
        </div>
      )}

      <div style={styles.scope}>
        Counts are real measured open data ({provenance.source}, {provenance.dataset},
        retrieved {provenance.retrievedDate}); count dates span multiple years. The fit
        depends on the demand scenario you set, and the cordon-only demand omits local
        trips, so it under-predicts where local traffic dominates. Counts are a factual
        readout, not a prediction.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: 20,
    right: 20,
    width: 270,
    background: "rgba(10,10,12,0.84)",
    backdropFilter: "blur(8px)",
    borderRadius: 10,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "#e8e0d0",
    fontFamily: "system-ui, sans-serif",
    fontSize: 12,
    zIndex: 10,
    userSelect: "none",
  },
  header: { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" },
  statRow: { display: "flex", alignItems: "baseline", gap: 6, color: "#a0a0a0" },
  value: { fontSize: 14, fontWeight: 600, color: "#e8e0d0", fontVariantNumeric: "tabular-nums" },
  label: { fontSize: 11 },
  sep: { color: "#555" },
  sub: { fontSize: 10.5, color: "#999" },
  prompt: { fontSize: 11.5, color: "#b8b0a4", lineHeight: 1.5 },
  scope: {
    fontSize: 10,
    color: "#8a96a0",
    lineHeight: 1.45,
    marginTop: 4,
    borderTop: "1px solid rgba(255,255,255,0.10)",
    paddingTop: 6,
  },
};
