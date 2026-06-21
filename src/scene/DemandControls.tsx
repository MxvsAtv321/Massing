"use client";

import { useState, useMemo, type CSSProperties } from "react";
import type { Place, ODFlow, FlowValidation } from "../traffic/demand";
import { Panel } from "../ui/Panel";
import { c, font, radius, ghostButton, primaryButton } from "../ui/theme";

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
    <Panel eyebrow="traffic demand" style={{ top: 20, right: 20, width: 270 }}>
      <div style={styles.disclosure}>
        Demand is an assumption you set. This tool never predicts the demand a development creates.
      </div>

      <Field label="From">
        <select value={pendingOrigin ?? ""} onChange={(e) => setOrigin(e.target.value || null)} style={styles.select}>
          <option value="">click a gateway or pick</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.side})
            </option>
          ))}
        </select>
      </Field>

      <Field label="To">
        <select value={pendingDestination ?? ""} onChange={(e) => setDestination(e.target.value || null)} style={styles.select}>
          <option value="">click a gateway or pick</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.side})
            </option>
          ))}
        </select>
      </Field>

      <div style={styles.addRow}>
        <input
          type="number"
          min={0}
          step={50}
          value={tripsText}
          onChange={(e) => setTripsText(e.target.value)}
          style={styles.tripsInput}
          aria-label="Trips per hour"
        />
        <span style={styles.unit}>trips/hr</span>
        <button onClick={handleAdd} style={primaryButton}>
          Add
        </button>
      </div>
      {error && <div style={styles.error}>{error}</div>}

      {flows.length > 0 && (
        <div style={styles.list} className="scroll-thin">
          {flows.map((f) => (
            <div key={f.id} style={styles.flowRow}>
              <span style={styles.flowText}>
                {labelOf(f.fromPlaceId)} <span style={styles.arrow}>{"→"}</span> {labelOf(f.toPlaceId)}
              </span>
              <span style={styles.flowTrips}>{f.tripsPerHour}</span>
              <button onClick={() => removeFlow(f.id)} style={styles.remove} title="Remove" aria-label="Remove flow">
                &times;
              </button>
            </div>
          ))}
          <div style={styles.totalRow}>
            <span>{flows.length} flows</span>
            <span>{totalTrips} trips/hr</span>
          </div>
        </div>
      )}

      <div style={styles.actions}>
        <button onClick={loadExample} style={{ ...ghostButton, flex: 1 }}>
          Load example
        </button>
        <button onClick={clearFlows} style={{ ...ghostButton, flex: 1, opacity: flows.length === 0 ? 0.4 : 1 }} disabled={flows.length === 0}>
          Clear
        </button>
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  disclosure: {
    fontFamily: font.sans,
    fontSize: 11,
    color: c.demand,
    lineHeight: 1.5,
    background: "color-mix(in srgb, var(--demand) 8%, transparent)",
    borderLeft: `2px solid color-mix(in srgb, var(--demand) 55%, transparent)`,
    padding: "7px 9px",
    borderRadius: 5,
    marginBottom: 9,
  },
  field: { display: "flex", flexDirection: "column", gap: 3, marginBottom: 7 },
  fieldLabel: { fontFamily: font.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.ink3 },
  select: {
    fontFamily: font.sans,
    fontSize: 12,
    color: c.ink,
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${c.hairline2}`,
    borderRadius: radius.sm,
    padding: "5px 8px",
    outline: "none",
    colorScheme: "dark",
  },
  addRow: { display: "flex", alignItems: "center", gap: 7, marginTop: 2 },
  tripsInput: {
    width: 76,
    fontFamily: font.mono,
    fontSize: 12,
    color: c.ink,
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${c.hairline2}`,
    borderRadius: radius.sm,
    padding: "5px 8px",
    outline: "none",
  },
  unit: { fontFamily: font.mono, fontSize: 10, color: c.ink3, flex: 1 },
  error: { fontFamily: font.sans, fontSize: 11, color: c.bad, marginTop: 6, lineHeight: 1.4 },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 188,
    overflowY: "auto",
    borderTop: `1px solid ${c.hairline}`,
    marginTop: 10,
    paddingTop: 8,
  },
  flowRow: { display: "flex", alignItems: "center", gap: 7 },
  flowText: { flex: 1, fontFamily: font.sans, fontSize: 11, color: c.ink2 },
  arrow: { color: c.demand },
  flowTrips: { fontFamily: font.mono, fontSize: 11, color: c.ink, fontVariantNumeric: "tabular-nums" },
  remove: { background: "transparent", border: "none", color: c.ink3, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" },
  totalRow: { display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.04em", color: c.ink3, marginTop: 3 },
  actions: { display: "flex", gap: 8, marginTop: 11 },
};
