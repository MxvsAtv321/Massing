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
  streets: [number, number][][];
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
      // A district with only a DefineDistrict (the agent's first streamed op) cannot expand yet, the
      // expander needs a LayStreets. Skip those rather than throw, so the live build comes up cleanly
      // op by op (clear, then streets, then towers) as the rest of the ops arrive.
      const next: ExpandedDistrict[] = [];
      for (const d of overlay.generatedDistricts) {
        try {
          next.push(expandDistrict(d, ctx, opts));
        } catch {
          // not expandable yet (no streets); render nothing for it this step
        }
      }
      setExpanded(next);
      setCleared(new Set(overlay.removedClusterIds));
    },
    []
  );

  const clear = useCallback(() => {
    setExpanded([]);
    setCleared(new Set());
  }, []);

  const massing = useMemo(() => expanded.flatMap((e) => e.massing), [expanded]);
  const streets = useMemo(() => expanded.flatMap((e) => e.streets), [expanded]);

  return { expanded, massing, streets, clearedClusterIds: cleared, applyDirective, clear };
}
