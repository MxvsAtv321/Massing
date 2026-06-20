"use client";

import type { NetworkStats } from "./roadGeometry";

// Small honesty readout for the street network. Top-left, out of the way of the solar
// controls (bottom) and the data-quality controls (bottom-right). Shows live facts: the
// counts, the drivable centerline length, and the connectivity status. The connectivity
// line is the one gate criterion computable in the browser; the full gate (geometry,
// oneway, known routes, alignment) runs offline via pnpm verify:network, named here so
// the readout is honest rather than a green light with nothing behind it.
export function NetworkReadout({ stats }: { stats: NetworkStats }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>Street network</div>

      <div style={styles.row}>
        <span style={styles.value}>{stats.graphNodes}</span>
        <span style={styles.label}>nodes</span>
        <span style={styles.sep}>·</span>
        <span style={styles.value}>{stats.directedEdges}</span>
        <span style={styles.label}>directed edges</span>
      </div>

      <div style={styles.row}>
        <span style={styles.value}>{stats.centerlineKm.toFixed(1)}</span>
        <span style={styles.label}>km drivable centerline</span>
      </div>

      <div style={styles.divider} />

      <div style={styles.statusRow}>
        <span style={{ ...styles.dot, background: stats.connected ? "#6aaa84" : "#c88a3a" }} />
        <span style={styles.status}>
          {stats.connected ? "Single connected component" : "Fragmented network"}
        </span>
      </div>
      {stats.strandedNodes > 0 && (
        <div style={styles.note}>
          {stats.strandedNodes} fringe nodes pruned (ramps, cordon stubs)
        </div>
      )}
      <div style={styles.gate}>
        Source: OpenStreetMap. Full gate: <code style={styles.code}>pnpm verify:network</code>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 20,
    left: 20,
    background: "rgba(10,10,12,0.82)",
    backdropFilter: "blur(8px)",
    borderRadius: 10,
    padding: "10px 14px",
    fontFamily: "system-ui, sans-serif",
    color: "#e8e0d0",
    zIndex: 10,
    maxWidth: 280,
    userSelect: "none",
  },
  header: {
    fontSize: 10,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    fontSize: 12,
    color: "#a0a0a0",
    marginBottom: 2,
  },
  value: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e8e0d0",
    fontVariantNumeric: "tabular-nums",
  },
  label: { fontSize: 11 },
  sep: { color: "#555", margin: "0 2px" },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.10)",
    margin: "8px 0 7px",
  },
  statusRow: { display: "flex", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  status: { fontSize: 12, color: "#e8e0d0" },
  note: { fontSize: 10.5, color: "#999", marginTop: 3, lineHeight: 1.4 },
  gate: { fontSize: 10.5, color: "#888", marginTop: 7, lineHeight: 1.5 },
  code: { color: "#a8b0a0", fontSize: 10.5 },
};
