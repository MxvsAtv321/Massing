"use client";

import type { CSSProperties } from "react";
import { formatTorontoDateTime } from "../solar/time";
import { computeBreakdown } from "./confidence";
import { buildFooterLines, type FooterInput } from "./footer";
import type { SunDriverState } from "../scene/useSunDriver";
import type { BuildingForScene } from "../scene/buildings";
import type { HypotheticalBuilding } from "../mutation/applyEdit";
import { c, font, radius } from "../ui/theme";

type FooterSourcesSlice = {
  dataset: string;
  vintage: string;
  retrievedDate: string;
  license: string;
  accuracyDisclaimer: string;
  bandScopeNote: string;
};

type Props = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  sun: SunDriverState;
  sources: FooterSourcesSlice;
  realBuildings: BuildingForScene[];
  hypotheticalBuildings: HypotheticalBuilding[];
};

const LINE_H = 17;
const PAD_X = 18;
const PAD_TOP = 34; // room for the title row
const PAD_BOTTOM = 13;

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

export function ExportButton({ canvasRef, sun, sources, realBuildings, hypotheticalBuildings }: Props) {
  async function handleExport() {
    const webglCanvas = canvasRef.current;
    if (!webglCanvas) return;

    const allBuildings: Array<{ confidenceKind: "measured" | "estimated" | "hypothetical" }> = [
      ...realBuildings,
      ...hypotheticalBuildings,
    ];
    const breakdown = computeBreakdown(allBuildings);
    const hypotheticalCount = hypotheticalBuildings.length;

    const footerInput: FooterInput = {
      ...sources,
      breakdown,
      hypotheticalCount,
      torontoDateTimeStr: formatTorontoDateTime(sun.utcDate),
      sunAltDeg: sun.altitude,
      sunAzDeg: sun.azimuth,
      isUsable: sun.isUsable,
    };

    const lines = buildFooterLines(footerInput);

    const monoFamily = cssVar("--font-mono", "monospace");
    const displayFamily = cssVar("--font-display", "Georgia, serif");
    if (typeof document !== "undefined" && document.fonts) {
      try {
        await document.fonts.ready;
      } catch {
        /* fall back to whatever is available */
      }
    }

    const footerH = PAD_TOP + lines.length * LINE_H + PAD_BOTTOM;
    const w = webglCanvas.width;
    const h = webglCanvas.height;

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h + footerH;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(webglCanvas, 0, 0);

    // Footer plate.
    ctx.fillStyle = "#15130e";
    ctx.fillRect(0, h, w, footerH);
    // Amber rule across the seam.
    ctx.fillStyle = "#f4a93a";
    ctx.fillRect(0, h, w, 2);

    // Title in the display serif.
    ctx.fillStyle = "#ece4d4";
    ctx.font = `600 16px ${displayFamily}`;
    ctx.fillText("Massing", PAD_X, h + 24);
    ctx.fillStyle = "#726a5c";
    ctx.font = `11px ${monoFamily}`;
    ctx.fillText("ST. LAWRENCE SHADOW + FLOW STUDY, TORONTO", PAD_X + 92, h + 23);

    // Provenance lines in mono.
    ctx.fillStyle = "#a89f8d";
    ctx.font = `12px ${monoFamily}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, PAD_X, h + PAD_TOP + (i + 1) * LINE_H - 4);
    });

    const url = offscreen.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "massing-shadow-study.png";
    a.click();
  }

  return (
    <button onClick={handleExport} style={styles.btn}>
      <span style={styles.glyph}>&#8595;</span> Export
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: font.sans,
    fontSize: 11.5,
    color: c.ink2,
    background: c.surface,
    backdropFilter: "var(--blur)",
    WebkitBackdropFilter: "var(--blur)",
    border: `1px solid ${c.hairline}`,
    borderRadius: radius.sm,
    padding: "6px 13px",
    cursor: "pointer",
    transition: "color 0.15s ease, border-color 0.15s ease",
  },
  glyph: { fontFamily: font.mono, color: c.accent, fontSize: 12 },
};
