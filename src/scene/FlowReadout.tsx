"use client";

import type { FlowResult } from "../traffic/assignment";

const RAMP = ["#45a05f", "#d9a640", "#d44f29", "#9e1f1a"]; // free -> jammed

export function FlowReadout({ flow }: { flow: FlowResult }) {
  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <div style={styles.panel}>
      <div style={styles.header}>Simulated flow</div>

      <div style={styles.row}>
        <span style={styles.value}>{fmt(flow.totalVehKmMid)}</span>
        <span style={styles.label}>vehicle-km/hr</span>
      </div>
      <div style={styles.bandLine}>
        band {fmt(flow.totalVehKmLow)} to {fmt(flow.totalVehKmHigh)}
      </div>

      <div style={styles.row}>
        <span style={styles.value}>{flow.congestedEdges}</span>
        <span style={styles.label}>congested links (v/c &gt; 0.9)</span>
      </div>
      <div style={styles.row}>
        <span style={styles.value}>{flow.maxVOverC.toFixed(1)}</span>
        <span style={styles.label}>peak v/c</span>
      </div>
      {flow.unroutable.length > 0 && (
        <div style={styles.warn}>{flow.unroutable.length} OD pairs unroutable</div>
      )}

      <div style={styles.legend}>
        <div style={styles.ramp}>
          {RAMP.map((c) => (
            <span key={c} style={{ ...styles.swatch, background: c }} />
          ))}
        </div>
        <div style={styles.legendLabels}>
          <span>free</span>
          <span>jammed</span>
        </div>
        <div style={styles.fadeNote}>Faded links = wider band (less certain).</div>
      </div>

      <div style={styles.scope}>{flow.scopeNote}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    bottom: 150,
    left: 20,
    width: 270,
    background: "rgba(10,10,12,0.84)",
    backdropFilter: "blur(8px)",
    borderRadius: 10,
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    color: "#e8e0d0",
    fontFamily: "system-ui, sans-serif",
    fontSize: 12,
    zIndex: 10,
    userSelect: "none",
  },
  header: {
    fontSize: 10,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 2,
  },
  row: { display: "flex", alignItems: "baseline", gap: 6, color: "#a0a0a0" },
  value: { fontSize: 14, fontWeight: 600, color: "#e8e0d0", fontVariantNumeric: "tabular-nums" },
  label: { fontSize: 11 },
  bandLine: { fontSize: 10.5, color: "#999", marginTop: -2, marginBottom: 2 },
  warn: { fontSize: 11, color: "#e0a060" },
  legend: { marginTop: 6, display: "flex", flexDirection: "column", gap: 3 },
  ramp: { display: "flex", height: 8, borderRadius: 3, overflow: "hidden" },
  swatch: { flex: 1 },
  legendLabels: { display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#888" },
  fadeNote: { fontSize: 10, color: "#888", marginTop: 1 },
  scope: {
    fontSize: 10,
    color: "#8a96a0",
    lineHeight: 1.45,
    marginTop: 6,
    borderTop: "1px solid rgba(255,255,255,0.10)",
    paddingTop: 6,
  },
};
