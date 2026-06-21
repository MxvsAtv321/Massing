"use client";

import type { CSSProperties } from "react";
import type { NetworkStats } from "./roadGeometry";
import { Panel } from "../ui/Panel";
import { c, font } from "../ui/theme";

// Small honesty readout for the street network. The connectivity line is the one gate
// criterion computable in the browser; the full gate runs offline via pnpm verify:network,
// named here so the readout is honest rather than a green light with nothing behind it.
export function NetworkReadout({ stats }: { stats: NetworkStats }) {
  return (
    <Panel eyebrow="street network" inFlow style={{ width: 248 }} delay={120}>
      <div style={styles.statline}>
        <Metric value={String(stats.graphNodes)} label="nodes" />
        <Metric value={String(stats.directedEdges)} label="edges" />
        <Metric value={stats.centerlineKm.toFixed(1)} label="km" />
      </div>

      <div style={styles.divider} />

      <div style={styles.statusRow}>
        <span style={{ ...styles.dot, background: stats.connected ? c.measured : c.estimated }} />
        <span style={styles.status}>
          {stats.connected ? "single connected component" : "fragmented network"}
        </span>
      </div>
      {stats.strandedNodes > 0 && (
        <div style={styles.note}>{stats.strandedNodes} fringe nodes pruned (ramps, cordon stubs)</div>
      )}
      <div style={styles.gate}>
        source OpenStreetMap &middot; gate <code style={styles.code}>pnpm verify:network</code>
      </div>
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
  statline: { display: "flex", gap: 18 },
  metric: { display: "flex", flexDirection: "column", gap: 1 },
  value: {
    fontFamily: font.mono,
    fontSize: 16,
    fontWeight: 500,
    color: c.ink,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
  },
  metricLabel: { fontFamily: font.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.ink3 },
  divider: { height: 1, background: c.hairline, margin: "9px 0 8px" },
  statusRow: { display: "flex", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  status: { fontFamily: font.sans, fontSize: 11.5, color: c.ink2 },
  note: { fontFamily: font.sans, fontSize: 10.5, color: c.ink3, marginTop: 4, lineHeight: 1.4 },
  gate: { fontFamily: font.sans, fontSize: 10, color: c.ink3, marginTop: 7 },
  code: { fontFamily: font.mono, color: c.ink2, fontSize: 10 },
};
