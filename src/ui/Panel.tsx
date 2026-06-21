"use client";

import type { CSSProperties, ReactNode } from "react";
import { c, font, radius } from "./theme";

const base: CSSProperties = {
  position: "fixed",
  background: c.surface,
  backdropFilter: "var(--blur)",
  WebkitBackdropFilter: "var(--blur)",
  border: `1px solid ${c.hairline}`,
  borderRadius: radius.md,
  boxShadow: "var(--shadow), inset 0 1px 0 rgba(255,255,255,0.05)",
  color: c.ink,
  fontFamily: font.sans,
  zIndex: 10,
  userSelect: "none",
};

const eyebrowRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 9,
};

const tick: CSSProperties = {
  width: 6,
  height: 2,
  borderRadius: 1,
  background: c.accent,
  flexShrink: 0,
};

const eyebrowText: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 9.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: c.ink3,
};

// The single instrument-bezel shell every panel uses. `style` sets position and size;
// `eyebrow` renders the mono header with an amber tick; `accessory` floats to the right.
export function Panel({
  children,
  style,
  eyebrow,
  accessory,
  padding = "12px 14px 13px",
  delay = 0,
}: {
  children: ReactNode;
  style?: CSSProperties;
  eyebrow?: string;
  accessory?: ReactNode;
  padding?: string | number;
  delay?: number;
}) {
  return (
    <div className="panel-rise" style={{ ...base, padding, animationDelay: `${delay}ms`, ...style }}>
      {eyebrow && (
        <div style={eyebrowRow}>
          <span style={tick} />
          <span style={eyebrowText}>{eyebrow}</span>
          {accessory && <span style={{ marginLeft: "auto" }}>{accessory}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
