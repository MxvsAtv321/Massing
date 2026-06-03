"use client";

import type { ClusterProvenanceEntry } from "./confidence";
import { computeShadowBand } from "./band";
import type { SunDriverState } from "../scene/useSunDriver";

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

export function BuildingInfoPanel({
  selectedClusterId,
  selectedHeightM,
  clusterProvenances,
  sun,
}: Props) {
  if (!selectedClusterId || selectedHeightM === null) return null;

  const isHypothetical = selectedClusterId.startsWith("user-");
  const prov = clusterProvenances[selectedClusterId];

  if (!isHypothetical && !prov) return null;

  let heightLabel: string;
  let srcLabel: string | null;
  let badgeText: string;
  let badgeStyle: React.CSSProperties;
  let sigmaLabel: string;
  let band: { mid: number; low: number; high: number } | null;

  if (isHypothetical) {
    const sigma = hypotheticalSigma(selectedHeightM);
    const approxStoreys = Math.round(selectedHeightM / 3);
    heightLabel = `~${Math.round(selectedHeightM)} m (~${approxStoreys} storeys)`;
    srcLabel = null;
    badgeText = "hypothetical — you added this";
    badgeStyle = styles.badgeHypo;
    sigmaLabel = `±${sigma} m (storey conversion)`;
    band = computeShadowBand(selectedHeightM, sigma, sun.altitude);
  } else {
    const sigma = prov.sigma_m;
    const src = prov.heightSrc ?? "unknown source";
    heightLabel = `${Math.round(prov.representativeHeight_m)} m`;
    srcLabel = prov.mixedSources ? `${src} (tallest), mixed sources` : src;
    badgeText = prov.confidenceKind;
    badgeStyle =
      prov.confidenceKind === "measured" ? styles.badgeMeasured : styles.badgeEstimated;
    sigmaLabel = `±${sigma} m`;
    band = computeShadowBand(prov.representativeHeight_m, sigma, sun.altitude);
  }

  return (
    <div style={styles.panel}>
      <div style={styles.title}>selected building</div>

      <div style={styles.row}>
        <span style={styles.label}>Height</span>
        <span style={styles.value}>{heightLabel}</span>
      </div>

      {srcLabel && (
        <div style={styles.row}>
          <span style={styles.label}>Source</span>
          <span style={{ ...styles.value, maxWidth: 160, textAlign: "right", lineHeight: "1.3" }}>
            {srcLabel}
          </span>
        </div>
      )}

      <div style={styles.row}>
        <span style={styles.label}>Confidence</span>
        <span style={{ ...styles.badge, ...badgeStyle }}>{badgeText}</span>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Sigma</span>
        <span style={styles.value}>{sigmaLabel}</span>
      </div>

      <div style={styles.divider} />

      {band ? (
        <div style={styles.row}>
          <span style={styles.label}>Shadow</span>
          <span style={styles.bandValue}>
            ~{band.mid} m
            <span style={styles.bandRange}> ({band.low}&ndash;{band.high} m)</span>
          </span>
        </div>
      ) : (
        <div style={styles.row}>
          <span style={styles.label}>Shadow</span>
          <span style={styles.lowSun}>low sun — not computed</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: 20,
    right: 20,
    background: "rgba(10,10,12,0.82)",
    backdropFilter: "blur(8px)",
    borderRadius: 10,
    padding: "10px 14px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    color: "#e8e0d0",
    fontFamily: "system-ui, sans-serif",
    fontSize: 12,
    minWidth: 220,
    maxWidth: 290,
    zIndex: 10,
    userSelect: "none",
  },
  title: {
    fontSize: 10,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 2,
  },
  row: {
    display: "flex",
    gap: 8,
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  label: {
    color: "#888",
    flexShrink: 0,
    fontSize: 11,
    minWidth: 64,
  },
  value: {
    color: "#e8e0d0",
    textAlign: "right",
    fontSize: 12,
  },
  badge: {
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
  badgeMeasured: {
    background: "rgba(100,180,130,0.22)",
    color: "#80d4a0",
    border: "1px solid rgba(100,180,130,0.35)",
  },
  badgeEstimated: {
    background: "rgba(200,140,50,0.22)",
    color: "#d4a060",
    border: "1px solid rgba(200,140,50,0.35)",
  },
  badgeHypo: {
    background: "rgba(212,144,10,0.22)",
    color: "#f0b840",
    border: "1px solid rgba(212,144,10,0.35)",
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.10)",
    margin: "2px 0",
  },
  bandValue: {
    color: "#f5e8c0",
    fontWeight: 500,
    fontSize: 13,
  },
  bandRange: {
    color: "#a8c4e0",
    fontWeight: 400,
    fontSize: 11,
  },
  lowSun: {
    color: "#e09060",
    fontStyle: "italic",
    fontSize: 11,
  },
};
