"use client";

import { useSyncExternalStore } from "react";

// Tiny DOM-facing store for the selection height readout. The canvas writes the
// live storeys while dragging and the committed storeys on selection; the DOM
// panel subscribes. null means nothing is selected and the readout hides.

let value: number | null = null;
const listeners = new Set<() => void>();

export const editHud = {
  setStoreys(s: number | null): void {
    if (s === value) return;
    value = s;
    for (const l of listeners) l();
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot(): number | null {
    return value;
  },
};

export function useEditHud(): number | null {
  return useSyncExternalStore(
    editHud.subscribe,
    editHud.getSnapshot,
    editHud.getSnapshot
  );
}
