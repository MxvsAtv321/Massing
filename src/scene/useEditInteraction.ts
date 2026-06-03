"use client";

import { useState, useCallback } from "react";
import { buildDiffLine, type EditOp } from "../mutation/editOp";
import type { ClusterIndexEntry } from "../model/types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ClickState =
  | { kind: "ground"; enu: [number, number] }
  | { kind: "building"; clusterId: string; heightM: number };

export type PendingPreview = {
  op: EditOp;
  diffLine: string;
};

// ─── Scene context assembly ───────────────────────────────────────────────────

type SceneContext = {
  clickedClusterId: string | null;
  clickEnu: [number, number] | null;
  nearbyClusters: { id: string; heightM: number }[];
  validClusterIds: string[];
};

function buildSceneContext(
  clickState: ClickState,
  clusters: Record<string, ClusterIndexEntry>
): SceneContext {
  const validClusterIds = Object.keys(clusters);

  // Clicked cluster first, then up to 9 of the tallest others for informational context.
  // The LLM does not pick a target from this list; the click owns the target (ADR-004).
  const clicked =
    clickState.kind === "building" ? clickState.clusterId : null;

  const nearbyClusters: { id: string; heightM: number }[] = Object.entries(clusters)
    .filter(([id]) => id !== clicked)
    .sort(([, a], [, b]) => b.representativeHeight_m - a.representativeHeight_m)
    .slice(0, clicked ? 9 : 10)
    .map(([id, entry]) => ({ id, heightM: entry.representativeHeight_m }));

  if (clicked && clusters[clicked]) {
    nearbyClusters.unshift({
      id: clicked,
      heightM: clusters[clicked].representativeHeight_m,
    });
  }

  return {
    clickedClusterId: clicked,
    clickEnu: clickState.kind === "ground" ? clickState.enu : null,
    nearbyClusters,
    validClusterIds,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEditInteraction(
  clusters: Record<string, ClusterIndexEntry>,
  metresPerStorey: number
): {
  clickState: ClickState | null;
  pendingPreview: PendingPreview | null;
  isLoading: boolean;
  error: string | null;
  onClusterClick: (clusterId: string) => void;
  onGroundClick: (enu: [number, number]) => void;
  submitText: (text: string) => Promise<void>;
  cancelPreview: () => void;
  clearClick: () => void;
} {
  const [clickState, setClickState] = useState<ClickState | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClusterClick = useCallback(
    (clusterId: string) => {
      const cluster = clusters[clusterId];
      if (!cluster) return;
      setPendingPreview(null);
      setError(null);
      setClickState({ kind: "building", clusterId, heightM: cluster.representativeHeight_m });
    },
    [clusters]
  );

  const onGroundClick = useCallback((enu: [number, number]) => {
    setPendingPreview(null);
    setError(null);
    setClickState({ kind: "ground", enu });
  }, []);

  const submitText = useCallback(
    async (userText: string) => {
      if (!clickState) return;
      setIsLoading(true);
      setError(null);

      const sceneContext = buildSceneContext(clickState, clusters);

      try {
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userText, sceneContext }),
        });
        const data = (await res.json()) as { ok: boolean; op?: EditOp; error?: string };

        if (!data.ok || !data.op) {
          setError(data.error ?? "Unknown error from server.");
          return;
        }

        const diffLine = buildDiffLine(data.op, metresPerStorey);
        setPendingPreview({ op: data.op, diffLine });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error — is the server running?");
      } finally {
        setIsLoading(false);
      }
    },
    [clickState, clusters, metresPerStorey]
  );

  const cancelPreview = useCallback(() => {
    setPendingPreview(null);
  }, []);

  const clearClick = useCallback(() => {
    setClickState(null);
    setPendingPreview(null);
    setError(null);
  }, []);

  return {
    clickState,
    pendingPreview,
    isLoading,
    error,
    onClusterClick,
    onGroundClick,
    submitText,
    cancelPreview,
    clearClick,
  };
}
