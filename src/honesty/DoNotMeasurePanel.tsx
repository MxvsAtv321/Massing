"use client";

import { useState } from "react";
import { DO_NOT_MEASURE_BEHAVIORAL, DO_NOT_MEASURE_SIMPLIFICATIONS } from "./doNotMeasure";

export function DoNotMeasurePanel() {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.container}>
      <button onClick={() => setOpen((o) => !o)} style={styles.toggle}>
        {open ? "▾" : "▸"} What this tool does not model
      </button>
      {open && (
        <div style={styles.body}>
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Refused: behavioral consequences</div>
            {DO_NOT_MEASURE_BEHAVIORAL.map((item) => (
              <div key={item.label} style={styles.item}>
                <span style={styles.itemLabel}>{item.label}</span>
                <span style={styles.itemReason}>{item.reason}</span>
              </div>
            ))}
          </div>
          <div style={styles.divider} />
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Disclosed: v1 simplifications</div>
            {DO_NOT_MEASURE_SIMPLIFICATIONS.map((item) => (
              <div key={item.label} style={styles.item}>
                <span style={styles.itemLabel}>{item.label}</span>
                <span style={styles.itemReason}>{item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 70,
    right: 20,
    background: "rgba(10,10,12,0.82)",
    backdropFilter: "blur(8px)",
    borderRadius: 10,
    fontFamily: "system-ui, sans-serif",
    fontSize: 12,
    color: "#e8e0d0",
    zIndex: 10,
    maxWidth: 340,
    userSelect: "none",
  },
  toggle: {
    background: "transparent",
    border: "none",
    color: "#c8c0b8",
    padding: "8px 14px",
    fontSize: 12,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  },
  body: {
    padding: "0 14px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  sectionHeader: {
    fontSize: 10,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 2,
  },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  itemLabel: {
    fontWeight: 600,
    fontSize: 12,
    color: "#e8e0d0",
  },
  itemReason: {
    fontSize: 11,
    color: "#a0a0a0",
    lineHeight: "1.4",
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.10)",
  },
};
