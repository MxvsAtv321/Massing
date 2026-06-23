"use client";

import { useSyncExternalStore } from "react";

// Which building cluster is currently selected, shared between the canvas (which
// writes it on a pick and reads it per frame for the gizmo) and any DOM panel
// (which subscribes for a readout). Same dependency-free useSyncExternalStore
// pattern as dayClockStore: one source of truth, no prop drilling, no new dep.

export type SelectionState = { selectedClusterId: string | null };

const state: SelectionState = { selectedClusterId: null };
let snapshot: SelectionState = { ...state };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { ...state };
  for (const l of listeners) l();
}

export const selection = {
  // Select a cluster, or pass null to clear. Idempotent: re-selecting the same
  // cluster does not notify, so a click that lands on the already-selected
  // building does not churn subscribers.
  select(clusterId: string | null): void {
    if (state.selectedClusterId === clusterId) return;
    state.selectedClusterId = clusterId;
    emit();
  },
  clear(): void {
    selection.select(null);
  },
  getSelected(): string | null {
    return state.selectedClusterId;
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot(): SelectionState {
    return snapshot;
  },
};

export function useSelection(): SelectionState {
  return useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
    selection.getSnapshot
  );
}
