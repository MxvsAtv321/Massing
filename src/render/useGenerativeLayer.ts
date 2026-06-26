"use client";

import { useState, useCallback, useMemo } from "react";
import { emptyOverlay } from "../mutation/applyEdit";
import { applyGenerativeOps } from "../generate/overlay";
import { expandDistrict, type ExpandedDistrict, type ExpandOpts } from "../generate/expand";
import type { GenerativeOp } from "../generate/op";
import type { GenerativeContext } from "../generate/types";
import type { MassingPlacement } from "../generate/massing";

// Client state for the generative proposal (G2, no agent yet): apply a directive's ops to a fresh
// overlay (ADR-R19, the baseline is never touched), expand each district to grounded geometry, and
// expose the massing for the renderer, the cleared cluster ids so the City drops the real buildings
// the proposal replaces, and the expanded districts for the study. The agent loop (G5) drives this
// same seam through a stream instead of a key press.

export type GenerativeLayer = {
  expanded: ExpandedDistrict[];
  massing: MassingPlacement[];
  clearedClusterIds: Set<string>;
  applyDirective: (ops: GenerativeOp[], ctx: GenerativeContext, opts: ExpandOpts) => void;
  clear: () => void;
};

export function useGenerativeLayer(): GenerativeLayer {
  const [expanded, setExpanded] = useState<ExpandedDistrict[]>([]);
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());

  const applyDirective = useCallback(
    (ops: GenerativeOp[], ctx: GenerativeContext, opts: ExpandOpts) => {
      const overlay = applyGenerativeOps(emptyOverlay(), ops, ctx);
      setExpanded(overlay.generatedDistricts.map((d) => expandDistrict(d, ctx, opts)));
      setCleared(new Set(overlay.removedClusterIds));
    },
    []
  );

  const clear = useCallback(() => {
    setExpanded([]);
    setCleared(new Set());
  }, []);

  const massing = useMemo(() => expanded.flatMap((e) => e.massing), [expanded]);

  return { expanded, massing, clearedClusterIds: cleared, applyDirective, clear };
}
