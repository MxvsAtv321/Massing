"use client";

import { useEffect, useMemo } from "react";
import { Object3D } from "three";
import { TransformControls } from "@react-three/drei";
import { useSelection } from "./selectionStore";
import { editRatios } from "./editRatios";
import { editHud } from "./editHud";
import {
  clampRatio,
  clampStoreys,
  ratioToStoreys,
  storeysToRatio,
  committedRatio,
} from "./heightEdit";
import { assembleEditOp, type EditOp, type LLMOutput } from "../mutation/editOp";
import type { EditOverlay } from "../mutation/applyEdit";

// The direct-manipulation edit path: a Y-only scale gizmo on the selected
// building. Dragging scales the cluster's instances live through editRatios (no
// React render per move); releasing snaps to whole storeys and commits a
// ModifyBuilding op, the same op the natural-language path resolves to
// (ADR-004 amended). OrbitControls is makeDefault in Scene, so drei's
// TransformControls suspends orbiting for the duration of a drag.
export function HeightGizmo({
  centroids,
  repHeights,
  overlay,
  metresPerStorey,
  validClusterIds,
  applyOp,
}: {
  centroids: Map<string, [number, number]>;
  repHeights: Map<string, number>;
  overlay: EditOverlay;
  metresPerStorey: number;
  validClusterIds: Set<string>;
  applyOp: (op: EditOp) => void;
}) {
  const { selectedClusterId: id } = useSelection();
  // Plain three Object3D so drei's instanceof check attaches it (drei imports
  // from "three"); rendered as a primitive so its world matrix stays current.
  const proxy = useMemo(() => new Object3D(), []);

  const repHeight = id ? repHeights.get(id) ?? 0 : 0;
  const editedRep = id ? overlay.modifiedClusterHeights.get(id) : undefined;
  const committed = editedRep !== undefined ? committedRatio(editedRep, repHeight) : 1;
  const centroid = id ? centroids.get(id) : undefined;
  const cx = centroid ? centroid[0] : 0;
  const cz = centroid ? centroid[1] : 0;

  // Re-anchor the proxy at the cluster base whenever the selection or its
  // committed height changes, so the gizmo starts where the building stands.
  useEffect(() => {
    if (!centroid || repHeight <= 0) return;
    proxy.position.set(cx, 0, cz);
    proxy.scale.set(1, committed, 1);
    proxy.updateMatrixWorld();
    editHud.setStoreys(
      clampStoreys(ratioToStoreys(committed, repHeight, metresPerStorey))
    );
  }, [proxy, centroid, cx, cz, committed, repHeight, metresPerStorey]);

  if (!id || !centroid || repHeight <= 0) return null;

  // Live: keep only the Y component (collapse any uniform-handle drag to height),
  // clamp to the legal storey range, and push the ratio to the renderer.
  const onObjectChange = () => {
    const r = clampRatio(proxy.scale.y, repHeight, metresPerStorey);
    proxy.scale.set(1, r, 1);
    editRatios.updateDrag(id, r);
    editHud.setStoreys(clampStoreys(ratioToStoreys(r, repHeight, metresPerStorey)));
  };

  // Commit: snap to whole storeys, pin the ratio for a seamless hand-off, then
  // record the op (skip a no-op edit so it does not pollute undo history).
  const onMouseUp = () => {
    const storeys = clampStoreys(
      ratioToStoreys(proxy.scale.y, repHeight, metresPerStorey)
    );
    const snapped = storeysToRatio(storeys, repHeight, metresPerStorey);
    proxy.scale.set(1, snapped, 1);

    editRatios.setCommittedFor(id, snapped);
    editRatios.endDrag();
    editHud.setStoreys(storeys);

    const current = clampStoreys(
      ratioToStoreys(committed, repHeight, metresPerStorey)
    );
    if (storeys !== current) {
      const raw: LLMOutput = { op: "ModifyBuilding", heightStoreys: storeys };
      applyOp(
        assembleEditOp(raw, {
          clickedClusterId: id,
          clickEnu: null,
          validClusterIds,
        })
      );
    }
  };

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        object={proxy}
        mode="scale"
        showX={false}
        showZ={false}
        onObjectChange={onObjectChange}
        onMouseUp={onMouseUp}
      />
    </>
  );
}
