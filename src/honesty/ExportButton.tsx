"use client";

import { formatTorontoDateTime } from "../solar/time";
import { computeBreakdown } from "./confidence";
import { buildFooterLines, type FooterInput } from "./footer";
import type { SunDriverState } from "../scene/useSunDriver";
import type { BuildingForScene } from "../scene/buildings";
import type { HypotheticalBuilding } from "../mutation/applyEdit";

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

const FOOTER_LINE_H = 17;
const FOOTER_PAD_X = 16;
const FOOTER_PAD_Y = 12;

export function ExportButton({
  canvasRef,
  sun,
  sources,
  realBuildings,
  hypotheticalBuildings,
}: Props) {
  function handleExport() {
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
    const footerH = FOOTER_PAD_Y * 2 + lines.length * FOOTER_LINE_H;

    const w = webglCanvas.width;
    const h = webglCanvas.height;

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h + footerH;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(webglCanvas, 0, 0);

    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, h, w, footerH);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, h, w, 1);

    ctx.fillStyle = "#c8c0b8";
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    lines.forEach((line, i) => {
      ctx.fillText(line, FOOTER_PAD_X, h + FOOTER_PAD_Y + (i + 1) * FOOTER_LINE_H);
    });

    const url = offscreen.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "massing-shadow-study.png";
    a.click();
  }

  return (
    <button onClick={handleExport} style={styles.btn}>
      Export PNG
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 6,
    color: "#c8c0b8",
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
};
