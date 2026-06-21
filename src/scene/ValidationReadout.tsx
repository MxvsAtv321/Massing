"use client";

import type { CSSProperties } from "react";
import type { ValidationResult } from "../traffic/validation";
import { Panel } from "../ui/Panel";
import { c, font } from "../ui/theme";

export type CountsProvenanceSlice = {
  dataset: string;
  source: string;
  retrievedDate: string;
};

function gehColor(geh: number): string {
  return geh < 5 ? "#57b87a" : geh < 10 ? "#d79a52" : "#d8694a";
}

// Compact simulated-vs-measured scatter against the y=x line. Points off the diagonal are
// disagreements, shown honestly.
function Scatter({ result }: { result: ValidationResult }) {
  const W = 240;
  const H = 150;
  const pad = 26;
  const max = Math.max(1, ...result.perStation.map((s) => Math.max(s.measured, s.simulated)));
  const sx = (v: number) => pad + (v / max) * (W - pad - 8);
  const sy = (v: number) => H - pad - (v / max) * (H - pad - 8);

  return (
    <svg width={W} height={H} style={{ display: "block", marginTop: 4 }}>
      <line x1={pad} y1={H - pad} x2={W - 8} y2={H - pad} stroke="#3a352c" strokeWidth={1} />
      <line x1={pad} y1={H - pad} x2={pad} y2={8} stroke="#3a352c" strokeWidth={1} />
      <line x1={sx(0)} y1={sy(0)} x2={sx(max)} y2={sy(max)} stroke="#7cc7e6" strokeDasharray="3 3" strokeWidth={1} opacity={0.7} />
      {result.perStation.map((s) => (
        <circle key={s.id} cx={sx(s.measured)} cy={sy(s.simulated)} r={2.6} fill={gehColor(s.geh)} fillOpacity={0.9} />
      ))}
      <text x={W / 2} y={H - 7} fill="#726a5c" fontSize={8.5} fontFamily="var(--font-mono)" letterSpacing="0.08em" textAnchor="middle">
        MEASURED VEH/HR
      </text>
      <text x={11} y={H / 2} fill="#726a5c" fontSize={8.5} fontFamily="var(--font-mono)" letterSpacing="0.08em" textAnchor="middle" transform={`rotate(-90 11 ${H / 2})`}>
        SIMULATED
      </text>
    </svg>
  );
}

export function ValidationReadout({
  validation,
  provenance,
  nStations,
}: {
  validation: ValidationResult | null;
  provenance: CountsProvenanceSlice;
  nStations: number;
}) {
  return (
    <Panel eyebrow="validation vs counts" style={{ top: 20, right: 20, width: 270 }}>
      {validation ? (
        <>
          <div style={styles.statline}>
            <Metric value={validation.medianGeh.toFixed(1)} label="median GEH" />
            <Metric value={`${validation.pctUnder5.toFixed(0)}%`} label="GEH < 5" />
            <Metric value={`${validation.pctUnder10.toFixed(0)}%`} label="GEH < 10" />
          </div>
          <div style={styles.sub}>{validation.nMatched} of {nStations} stations matched to the network</div>
          <Scatter result={validation} />
        </>
      ) : (
        <div style={styles.prompt}>
          {nStations} measured count stations loaded. Toggle Flow to score the simulation against them.
        </div>
      )}

      <div style={styles.scope}>
        Counts are real measured open data ({provenance.source}), retrieved {provenance.retrievedDate}; dates span
        multiple years. The fit depends on the demand scenario you set, and the cordon-only demand omits local trips,
        so it under-predicts where local traffic dominates. A factual readout, not a prediction.
      </div>
    </Panel>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div style={styles.metric}>
      <span style={styles.value}>{value}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  statline: { display: "flex", gap: 16 },
  metric: { display: "flex", flexDirection: "column", gap: 1 },
  value: { fontFamily: font.mono, fontSize: 15, fontWeight: 500, color: c.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 },
  metricLabel: { fontFamily: font.mono, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ink3 },
  sub: { fontFamily: font.sans, fontSize: 10.5, color: c.ink3, marginTop: 6 },
  prompt: { fontFamily: font.sans, fontSize: 11.5, color: c.ink2, lineHeight: 1.5 },
  scope: { fontFamily: font.sans, fontSize: 10, color: c.ink3, lineHeight: 1.45, marginTop: 9, borderTop: `1px solid ${c.hairline}`, paddingTop: 8 },
};
