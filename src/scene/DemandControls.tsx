"use client";

import { useState, useMemo } from "react";
import type { Place, ODFlow, FlowValidation } from "../traffic/demand";

type Props = {
  places: Place[];
  flows: ODFlow[];
  pendingOrigin: string | null;
  pendingDestination: string | null;
  setOrigin: (id: string | null) => void;
  setDestination: (id: string | null) => void;
  addPendingFlow: (tripsPerHour: number) => FlowValidation;
  removeFlow: (id: string) => void;
  loadExample: () => void;
  clearFlows: () => void;
};

export function DemandControls({
  places,
  flows,
  pendingOrigin,
  pendingDestination,
  setOrigin,
  setDestination,
  addPendingFlow,
  removeFlow,
  loadExample,
  clearFlows,
}: Props) {
  const [tripsText, setTripsText] = useState("800");
  const [error, setError] = useState<string | null>(null);

  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of places) m.set(p.id, p.label);
    return (id: string) => m.get(id) ?? id;
  }, [places]);

  const totalTrips = flows.reduce((s, f) => s + f.tripsPerHour, 0);

  const handleAdd = () => {
    const n = parseInt(tripsText, 10);
    const res = addPendingFlow(Number.isFinite(n) ? n : NaN);
    setError(res.ok ? null : res.reason);
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>Traffic demand</div>
      <div style={styles.disclosure}>
        Demand is an assumption you set. This tool never predicts the demand a development
        creates.
      </div>

      <div style={styles.field}>
        <label style={styles.fieldLabel}>From</label>
        <select
          value={pendingOrigin ?? ""}
          onChange={(e) => setOrigin(e.target.value || null)}
          style={styles.select}
        >
          <option value="">click a gateway or pick…</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.side})
            </option>
          ))}
        </select>
      </div>

      <div style={styles.field}>
        <label style={styles.fieldLabel}>To</label>
        <select
          value={pendingDestination ?? ""}
          onChange={(e) => setDestination(e.target.value || null)}
          style={styles.select}
        >
          <option value="">click a gateway or pick…</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.side})
            </option>
          ))}
        </select>
      </div>

      <div style={styles.addRow}>
        <input
          type="number"
          min={0}
          step={50}
          value={tripsText}
          onChange={(e) => setTripsText(e.target.value)}
          style={styles.tripsInput}
        />
        <span style={styles.unit}>trips/hr</span>
        <button onClick={handleAdd} style={styles.addBtn}>
          Add
        </button>
      </div>
      {error && <div style={styles.error}>{error}</div>}

      {flows.length > 0 && (
        <div style={styles.list}>
          {flows.map((f) => (
            <div key={f.id} style={styles.flowRow}>
              <span style={styles.flowText}>
                {labelOf(f.fromPlaceId)} <span style={styles.arrow}>{"->"}</span>{" "}
                {labelOf(f.toPlaceId)}
              </span>
              <span style={styles.flowTrips}>{f.tripsPerHour}/hr</span>
              <button
                onClick={() => removeFlow(f.id)}
                style={styles.removeBtn}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <div style={styles.totalRow}>
            <span>{flows.length} flows</span>
            <span>{totalTrips}/hr total</span>
          </div>
        </div>
      )}

      <div style={styles.actions}>
        <button onClick={loadExample} style={styles.secondaryBtn}>
          Load example
        </button>
        <button onClick={clearFlows} style={styles.secondaryBtn} disabled={flows.length === 0}>
          Clear all
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: 20,
    right: 20,
    width: 280,
    background: "rgba(10,10,12,0.84)",
    backdropFilter: "blur(8px)",
    borderRadius: 10,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
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
  },
  disclosure: {
    fontSize: 11,
    color: "#7ec8e3",
    lineHeight: 1.45,
    background: "rgba(126,200,227,0.08)",
    borderLeft: "2px solid rgba(126,200,227,0.5)",
    padding: "6px 8px",
    borderRadius: 4,
  },
  field: { display: "flex", flexDirection: "column", gap: 3 },
  fieldLabel: { fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.04em" },
  select: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 6,
    color: "#f0ece4",
    padding: "5px 8px",
    fontSize: 12,
    outline: "none",
  },
  addRow: { display: "flex", alignItems: "center", gap: 6 },
  tripsInput: {
    width: 78,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 6,
    color: "#f0ece4",
    padding: "5px 8px",
    fontSize: 12,
    outline: "none",
  },
  unit: { fontSize: 11, color: "#999", flex: 1 },
  addBtn: {
    background: "rgba(126,200,227,0.20)",
    border: "1px solid rgba(126,200,227,0.45)",
    borderRadius: 6,
    color: "#bfe6f3",
    padding: "5px 14px",
    fontSize: 12,
    cursor: "pointer",
  },
  error: { color: "#e07060", fontSize: 11, lineHeight: 1.4 },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 200,
    overflowY: "auto",
    borderTop: "1px solid rgba(255,255,255,0.10)",
    paddingTop: 6,
  },
  flowRow: { display: "flex", alignItems: "center", gap: 6 },
  flowText: { flex: 1, fontSize: 11, color: "#d8d0c4" },
  arrow: { color: "#7ec8e3" },
  flowTrips: { fontSize: 11, color: "#e8e0d0", fontVariantNumeric: "tabular-nums" },
  removeBtn: {
    background: "transparent",
    border: "none",
    color: "#888",
    cursor: "pointer",
    fontSize: 12,
    padding: "0 2px",
    lineHeight: 1,
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10.5,
    color: "#999",
    marginTop: 2,
  },
  actions: { display: "flex", gap: 8 },
  secondaryBtn: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 6,
    color: "#c8c0b8",
    padding: "5px 0",
    fontSize: 11,
    cursor: "pointer",
  },
};
