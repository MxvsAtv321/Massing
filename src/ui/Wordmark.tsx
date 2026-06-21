"use client";

import type { CSSProperties } from "react";
import { c, font } from "./theme";

// Quiet brand presence, top-left, above the command input. Non-interactive.
export function Wordmark() {
  return (
    <div className="panel-rise" style={wrap}>
      <div style={mark}>Massing</div>
      <div style={tag}>St. Lawrence shadow + flow study</div>
    </div>
  );
}

const wrap: CSSProperties = {
  position: "fixed",
  top: 18,
  left: 22,
  zIndex: 11,
  pointerEvents: "none",
  userSelect: "none",
};

const mark: CSSProperties = {
  fontFamily: font.display,
  fontSize: 27,
  fontWeight: 500,
  lineHeight: 1,
  letterSpacing: "-0.01em",
  color: c.ink,
};

const tag: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 9.5,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: c.ink3,
  marginTop: 6,
};
