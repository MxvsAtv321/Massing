"use client";

import type { CSSProperties } from "react";
import { c, font, radius } from "./theme";

export type Segment = {
  id: string;
  label: string;
  active: boolean;
  onToggle: () => void;
};

// A single console of view toggles with an amber active fill and a status dot, replacing
// the scattered "circle X" text buttons.
export function SegmentedControl({ segments }: { segments: Segment[] }) {
  return (
    <div style={wrap}>
      {segments.map((s) => (
        <button
          key={s.id}
          onClick={s.onToggle}
          aria-pressed={s.active}
          style={{ ...seg, ...(s.active ? segActive : {}) }}
        >
          <span style={{ ...dot, ...(s.active ? dotActive : {}) }} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

const wrap: CSSProperties = {
  display: "inline-flex",
  gap: 2,
  padding: 3,
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${c.hairline}`,
  borderRadius: radius.sm,
};

const seg: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: font.sans,
  fontSize: 11.5,
  color: c.ink2,
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 6,
  padding: "4px 9px",
  cursor: "pointer",
  transition: "background 0.15s ease, color 0.15s ease",
};

const segActive: CSSProperties = {
  background: c.accentSoft,
  color: c.accent,
};

const dot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  border: `1px solid ${c.ink3}`,
  background: "transparent",
  flexShrink: 0,
};

const dotActive: CSSProperties = {
  border: `1px solid ${c.accent}`,
  background: c.accent,
  boxShadow: "0 0 6px rgba(244,169,58,0.7)",
};
