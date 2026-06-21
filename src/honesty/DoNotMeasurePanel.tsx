"use client";

import { useState, type CSSProperties } from "react";
import { DO_NOT_MEASURE_BEHAVIORAL, DO_NOT_MEASURE_SIMPLIFICATIONS } from "./doNotMeasure";
import { c, font, radius } from "../ui/theme";

export function DoNotMeasurePanel() {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.container} className="panel-rise">
      <button onClick={() => setOpen((o) => !o)} style={{ ...styles.toggle, ...(open ? styles.toggleOpen : {}) }}>
        <span style={styles.chevron}>{open ? "▾" : "▸"}</span>
        what this tool does not model
      </button>
      {open && (
        <div style={styles.body}>
          <Section title="Refused: behavioral consequences" items={DO_NOT_MEASURE_BEHAVIORAL} />
          <div style={styles.divider} />
          <Section title="Disclosed: v1 simplifications" items={DO_NOT_MEASURE_SIMPLIFICATIONS} />
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: readonly { label: string; reason: string }[] }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>{title}</div>
      {items.map((item) => (
        <div key={item.label} style={styles.item}>
          <span style={styles.itemLabel}>{item.label}</span>
          <span style={styles.itemReason}>{item.reason}</span>
        </div>
      ))}
    </div>
  );
}

const bezel: CSSProperties = {
  background: c.surface,
  backdropFilter: "var(--blur)",
  WebkitBackdropFilter: "var(--blur)",
  border: `1px solid ${c.hairline}`,
  boxShadow: "var(--shadow), inset 0 1px 0 rgba(255,255,255,0.05)",
};

const styles: Record<string, CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 64,
    right: 20,
    zIndex: 10,
    maxWidth: 340,
    userSelect: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 7,
  },
  toggle: {
    ...bezel,
    borderRadius: radius.sm,
    color: c.ink2,
    padding: "6px 12px",
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  },
  toggleOpen: { color: c.accent, borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" },
  chevron: { color: c.accent, fontSize: 9 },
  body: {
    ...bezel,
    borderRadius: radius.md,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: 320,
  },
  section: { display: "flex", flexDirection: "column", gap: 7 },
  sectionHeader: {
    fontFamily: font.mono,
    fontSize: 9.5,
    color: c.ink3,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: 1,
  },
  item: { display: "flex", flexDirection: "column", gap: 2 },
  itemLabel: { fontFamily: font.sans, fontWeight: 600, fontSize: 12, color: c.ink },
  itemReason: { fontFamily: font.sans, fontSize: 11, color: c.ink3, lineHeight: 1.45 },
  divider: { height: 1, background: c.hairline },
};
