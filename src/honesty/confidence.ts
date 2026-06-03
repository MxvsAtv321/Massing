import type { Building, ClusterIndexEntry } from "../model/types";

export type ClusterProvenanceEntry = {
  representativeHeight_m: number;
  heightSrc: string | null;      // raw HEIGHT_SRC value from the tallest member
  confidenceKind: "measured" | "estimated";
  sigma_m: number;
  mixedSources: boolean;          // true when cluster members differ in confidence kind
  memberCount: number;
};

export type ConfidenceBreakdown = {
  measured: number;
  estimated: number;
  hypothetical: number;
};

export function computeBreakdown(
  buildings: Array<{ confidenceKind: "measured" | "estimated" | "hypothetical" }>
): ConfidenceBreakdown {
  const result: ConfidenceBreakdown = { measured: 0, estimated: 0, hypothetical: 0 };
  for (const b of buildings) {
    result[b.confidenceKind]++;
  }
  return result;
}

// Server-side: computes the per-cluster provenance map from the full Building list.
export function buildClusterProvenances(
  buildings: Building[],
  clusters: Record<string, ClusterIndexEntry>
): Record<string, ClusterProvenanceEntry> {
  const byId = new Map<string, Building>();
  for (const b of buildings) byId.set(b.id, b);

  const result: Record<string, ClusterProvenanceEntry> = {};

  for (const [clusterId, entry] of Object.entries(clusters)) {
    const tallest = byId.get(entry.tallestMemberId);
    if (!tallest) continue;

    const conf = tallest.height.confidence;
    const confidenceKind: "measured" | "estimated" =
      conf.kind === "measured" ? "measured" : "estimated";
    const sigma_m = conf.kind !== "hypothetical" ? conf.sigma_m : 0;

    // Mixed sources: any member has a different confidence kind from the tallest.
    let mixedSources = false;
    for (const memberId of entry.memberIds) {
      const member = byId.get(memberId);
      if (!member) continue;
      const mk = member.height.confidence.kind;
      if (mk !== "hypothetical" && mk !== confidenceKind) {
        mixedSources = true;
        break;
      }
    }

    result[clusterId] = {
      representativeHeight_m: entry.representativeHeight_m,
      heightSrc: tallest.heightSrc,
      confidenceKind,
      sigma_m,
      mixedSources,
      memberCount: entry.memberIds.length,
    };
  }

  return result;
}
