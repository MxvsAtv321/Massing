// The per-cluster Y-scale ratios currently applied to the city BatchedMesh: the
// single source the renderer reads each frame to scale a building's height. Two
// layers, merged by ratioFor: committed ratios mirrored from the edit overlay
// (persisted, undoable) and a transient live-drag override while the gizmo runs.
// Imperative on purpose so the canvas reads it per frame without React renders,
// the same shape as dayClockStore.

let committed = new Map<string, number>();
let drag: { clusterId: string | null; ratio: number } = { clusterId: null, ratio: 1 };
let version = 0;

export const editRatios = {
  // Replace the committed ratios wholesale from the overlay (Scene, on edit/undo).
  setCommitted(map: Map<string, number>): void {
    committed = map;
    version++;
  },
  // Pin one committed ratio immediately. Used the instant a drag is released so
  // the building holds its new height for the frames before the React overlay
  // update lands, instead of snapping back to the original for a frame or two.
  setCommittedFor(clusterId: string, ratio: number): void {
    committed = new Map(committed);
    committed.set(clusterId, ratio);
    version++;
  },
  updateDrag(clusterId: string, ratio: number): void {
    drag = { clusterId, ratio };
    version++;
  },
  endDrag(): void {
    drag = { clusterId: null, ratio: 1 };
    version++;
  },
  ratioFor(clusterId: string | null): number {
    if (clusterId === null) return 1;
    if (drag.clusterId === clusterId) return drag.ratio;
    return committed.get(clusterId) ?? 1;
  },
  draggingCluster(): string | null {
    return drag.clusterId;
  },
  committedClusterIds(): string[] {
    return [...committed.keys()];
  },
  // Bumped on every change so the renderer can skip work on idle frames.
  version(): number {
    return version;
  },
};
