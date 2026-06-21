import type { CSSProperties } from "react";

// Calibrated-instrument design tokens, surfaced as CSS-variable references so inline
// styles and globals.css stay in sync. The instrument speaks in mono; titles in the
// display serif; labels in the grotesque.

export const c = {
  surface: "var(--surface)",
  surfaceSolid: "var(--surface-solid)",
  hairline: "var(--hairline)",
  hairline2: "var(--hairline-2)",
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  ink3: "var(--ink-3)",
  accent: "var(--accent)",
  accentInk: "var(--accent-ink)",
  accentSoft: "var(--accent-soft)",
  measured: "var(--measured)",
  estimated: "var(--estimated)",
  hypothetical: "var(--hypothetical)",
  demand: "var(--demand)",
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
} as const;

export const font = {
  display: "var(--font-display), Georgia, serif",
  sans: "var(--font-sans), system-ui, sans-serif",
  mono: "var(--font-mono), ui-monospace, monospace",
} as const;

export const radius = { md: "var(--radius)", sm: "var(--radius-sm)" } as const;

// A faint tint of a semantic color, for badges and chips.
export function tint(color: string, pct = 14): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export const eyebrow: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 9.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: c.ink3,
};

export const label: CSSProperties = {
  fontFamily: font.sans,
  fontSize: 11.5,
  color: c.ink3,
};

export const dataValue: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 12.5,
  color: c.ink,
  fontVariantNumeric: "tabular-nums",
};

export const unitStyle: CSSProperties = { color: c.ink3, fontWeight: 400 };

export type SemanticKind = "measured" | "estimated" | "hypothetical" | "demand";

export function badge(kind: SemanticKind): CSSProperties {
  const map: Record<SemanticKind, string> = {
    measured: c.measured,
    estimated: c.estimated,
    hypothetical: c.hypothetical,
    demand: c.demand,
  };
  const col = map[kind];
  return {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: col,
    border: `1px solid ${tint(col, 55)}`,
    background: tint(col, 13),
    borderRadius: 999,
    padding: "1px 8px",
    whiteSpace: "nowrap",
  };
}

export const divider: CSSProperties = {
  height: 1,
  background: c.hairline,
  border: "none",
  margin: "3px 0",
};

// Quiet secondary button (presets, export, clear).
export const ghostButton: CSSProperties = {
  fontFamily: font.sans,
  fontSize: 11.5,
  color: c.ink2,
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${c.hairline}`,
  borderRadius: radius.sm,
  padding: "5px 11px",
  cursor: "pointer",
  transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
};

// Primary (solar) action.
export const primaryButton: CSSProperties = {
  fontFamily: font.sans,
  fontSize: 11.5,
  fontWeight: 600,
  color: c.accentInk,
  background: c.accent,
  border: "1px solid transparent",
  borderRadius: radius.sm,
  padding: "5px 13px",
  cursor: "pointer",
  transition: "filter 0.15s ease",
};
