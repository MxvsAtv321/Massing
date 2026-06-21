"use client";

import type { CSSProperties } from "react";
import type { FlowResult } from "../traffic/assignment";
import { Panel } from "../ui/Panel";
import { c, font } from "../ui/theme";

const RAMP = ["#45a05f", "#d9a640", "#d44f29", "#9e1f1a"]; // free -> jammed

export function FlowReadout({ flow }: { flow: FlowResult }) {
  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <Panel eyebrow="simulated flow" inFlow style={{ width: 248 }} delay={160}>
      <div style={styles.bigRow}>
        <span style={styles.big}>{fmt(flow.totalVehKmMid)}</span>
        <span style={styles.bigUnit}>veh&middot;km/hr</span>
      </div>
      <div style={styles.band}>
        band {fmt(flow.totalVehKmLow)} to {fmt(flow.totalVehKmHigh)}
      </div>

      <div style={styles.statline}>
        <Metric value={String(flow.congestedEdges)} label="congested" />
        <Metric value={flow.maxVOverC.toFixed(1)} label="peak v/c" />
      </div>
      {flow.unroutable.length > 0 && (
        <div style={styles.warn}>{flow.unroutable.length} OD pairs unroutable</div>
      )}

      <div style={styles.legend}>
        <div style={styles.ramp}>
          {RAMP.map((col) => (
            <span key={col} style={{ ...styles.swatch, background: col }} />
          ))}
        </div>
        <div style={styles.legendLabels}>
          <span>free</span>
          <span>jammed</span>
        </div>
      </div>

      <div style={styles.scope}>{flow.scopeNote}</div>
    </Panel>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div style={styles.metric}>
      <span style={styles.value}>{value}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bigRow: { display: "flex", alignItems: "baseline", gap: 6 },
  big: { fontFamily: font.mono, fontSize: 19, fontWeight: 500, color: c.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 },
  bigUnit: { fontFamily: font.mono, fontSize: 10, letterSpacing: "0.06em", color: c.ink3 },
  band: { fontFamily: font.sans, fontSize: 10.5, color: c.ink3, marginTop: 3 },
  statline: { display: "flex", gap: 20, marginTop: 9 },
  metric: { display: "flex", flexDirection: "column", gap: 1 },
  value: { fontFamily: font.mono, fontSize: 14, fontWeight: 500, color: c.ink, fontVariantNumeric: "tabular-nums" },
  metricLabel: { fontFamily: font.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.ink3 },
  warn: { fontFamily: font.sans, fontSize: 11, color: c.estimated, marginTop: 6 },
  legend: { marginTop: 10, display: "flex", flexDirection: "column", gap: 3 },
  ramp: { display: "flex", height: 7, borderRadius: 3, overflow: "hidden" },
  swatch: { flex: 1 },
  legendLabels: { display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ink3 },
  scope: { fontFamily: font.sans, fontSize: 10, color: c.ink3, lineHeight: 1.45, marginTop: 9, borderTop: `1px solid ${c.hairline}`, paddingTop: 8 },
};
