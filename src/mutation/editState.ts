"use client";

import { useState, useMemo, useCallback } from "react";
import {
  applyOpToOverlay,
  replayLog,
  emptyOverlay,
  computeEffectiveBuildings,
  type EditOverlay,
  type HypotheticalBuilding,
} from "./applyEdit";
import type { EditOp } from "./editOp";
import type { BuildingForScene } from "./building";

type EditLayerInternalState = {
  log: EditOp[];
  overlay: EditOverlay;
};

export type EditLayerState = {
  realBuildings: BuildingForScene[];
  hypotheticalBuildings: HypotheticalBuilding[];
  overlay: EditOverlay;
  canUndo: boolean;
  applyOp: (op: EditOp) => void;
  undo: () => void;
};

export function useEditLayer(
  originalBuildings: BuildingForScene[],
  clusterRepHeights: Map<string, number>,
  metresPerStorey: number
): EditLayerState {
  const [state, setState] = useState<EditLayerInternalState>({
    log: [],
    overlay: emptyOverlay(),
  });

  const applyOp = useCallback(
    (op: EditOp) => {
      setState((prev) => {
        const addCount = prev.log.filter((o) => o.op === "AddBuilding").length;
        const newLog = [...prev.log, op];
        const newOverlay = applyOpToOverlay(
          prev.overlay,
          op,
          clusterRepHeights,
          metresPerStorey,
          addCount
        );
        return { log: newLog, overlay: newOverlay };
      });
    },
    [clusterRepHeights, metresPerStorey]
  );

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.log.length === 0) return prev;
      const newLog = prev.log.slice(0, -1);
      const newOverlay = replayLog(newLog, clusterRepHeights, metresPerStorey);
      return { log: newLog, overlay: newOverlay };
    });
  }, [clusterRepHeights, metresPerStorey]);

  const { realBuildings, hypotheticalBuildings } = useMemo(
    () => computeEffectiveBuildings(originalBuildings, clusterRepHeights, state.overlay),
    [originalBuildings, clusterRepHeights, state.overlay]
  );

  return {
    realBuildings,
    hypotheticalBuildings,
    overlay: state.overlay,
    canUndo: state.log.length > 0,
    applyOp,
    undo,
  };
}
