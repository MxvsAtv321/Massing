"use client";

import type { CSSProperties } from "react";
import type { ClusterProvenanceEntry } from "./confidence";
import { computeShadowBand } from "./band";
import type { SunDriverState } from "../scene/useSunDriver";
import { Panel } from "../ui/Panel";
import { c, font, badge, type SemanticKind } from "../ui/theme";

// Storey-to-metre sigma: 0.25 m per storey (storey = 3 m), minimum 3 m.
function hypotheticalSigma(heightM: number): number {
  return Math.max(3, Math.round(heightM / 12));
}

type Props = {
  selectedClusterId: string | null;
  selectedHeightM: number | null;
  clusterProvenances: Record<string, ClusterProvenanceEntry>;
  sun: SunDriverState;
};

export function BuildingInfoPanel({ selectedClusterId, selectedHeightM, clusterProvenances, sun }: Props) {
  if (!selectedClusterId || selectedHeightM === null) return null;

  const isHypothetical = selectedClusterId.startsWith("user-");
  const prov = clusterProvenances[selectedClusterId];
  if (!isHypothetical && !prov) return null;

  let kind: SemanticKind;
  let heightLabel: string;
  let srcLabel: string | null;
  let sigmaLabel: string;
  let band: { mid: number; low: number; high: number } | null;
  let hypoNote = false;

  if (isHypothetical) {
    const sigma = hypotheticalSigma(selectedHeightM);
    const approxStoreys = Math.round(selectedHeightM / 3);
    kind = "hypothetical";
    heightLabel = `~${Math.round(selectedHeightM)} m`;
    srcLabel = `~${approxStoreys} storeys, storey conversion`;
    sigmaLabel = `+/-${sigma} m`;
    band = computeShadowBand(selectedHeightM, sigma, sun.altitude);
    hypoNote = true;
  } else {
    const sigma = prov.sigma_m;
    const src = prov.heightSrc ?? "unknown source";
    kind = prov.confidenceKind === "measured" ? "measured" : "estimated";
    heightLabel = `${Math.round(prov.representativeHeight_m)} m`;
    srcLabel = prov.mixedSources ? `${src} (tallest), mixed` : src;
    sigmaLabel = `+/-${sigma} m`;
    band = computeShadowBand(prov.representativeHeight_m, sigma, sun.altitude);
  }

  return (
    <Panel eyebrow="selected building" style={{ top: 20, right: 20, width: 250 }}>
      <Row label="Height">
        <span style={styles.value}>
          {heightLabel} <span style={styles.unit}>{sigmaLabel}</span>
        </span>
      </Row>
      {srcLabel && (
        <Row label="Source">
          <span style={styles.src}>{srcLabel}</span>
        </Row>
      )}
      <Row label="Confidence">
        <span style={badge(kind)}>{kind}</span>
      </Row>
      {hypoNote && <div style={styles.hypoNote}>You added this. Hypothetical everywhere, counted in exports.</div>}

      <div style={styles.divider} />

      <Row label="Shadow">
        {band ? (
          <span style={styles.value}>
            ~{band.mid} m <span style={styles.range}>{band.low}-{band.high} m</span>
          </span>
        ) : (
          <span style={styles.lowSun}>low sun, not computed</span>
        )}
      </Row>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={styles.right}>{children}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  row: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "2.5px 0" },
  label: { fontFamily: font.sans, fontSize: 11.5, color: c.ink3, flexShrink: 0 },
  right: { textAlign: "right" },
  value: { fontFamily: font.mono, fontSize: 12.5, color: c.ink, fontVariantNumeric: "tabular-nums" },
  unit: { color: c.ink3 },
  range: { color: c.demand, fontSize: 11 },
  src: { fontFamily: font.sans, fontSize: 11, color: c.ink2, textAlign: "right", lineHeight: 1.35, maxWidth: 150, display: "inline-block" },
  hypoNote: { fontFamily: font.sans, fontSize: 10.5, color: c.hypothetical, lineHeight: 1.4, marginTop: 4 },
  divider: { height: 1, background: c.hairline, margin: "8px 0" },
  lowSun: { fontFamily: font.sans, fontSize: 11, color: c.estimated, fontStyle: "italic" },
};
