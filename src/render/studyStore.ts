"use client";

import { useSyncExternalStore } from "react";

// The active calendar date for the scene and the sun-access study (Unit 8), shared
// by the lighting (which drives the real sun off it), the time-of-day label, and
// the study itself in later increments. Introduced here to close the parked
// date-picker TODO in Lighting.tsx. Config, region, result, and status join this
// store as the study is built out.
//
// Defaults to the summer solstice the scene opened on, so the established look is
// unchanged until the user picks another day. The study recommends the autumn
// equinox (DEFAULT_STUDY_DATE in src/study), which is one click away in the control.

export type StudyState = {
  date: string; // ISO yyyy-mm-dd, interpreted in America/Toronto
};

const SCENE_OPEN_DATE = "2026-06-21"; // summer solstice, the established opening look

const state: StudyState = { date: SCENE_OPEN_DATE };
let snapshot: StudyState = { ...state };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { ...state };
  for (const l of listeners) l();
}

export const studyState = {
  // Imperative read for the per-frame canvas path (Lighting), no React render.
  getDate(): string {
    return state.date;
  },
  setDate(date: string): void {
    if (date === state.date) return;
    state.date = date;
    emit();
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot(): StudyState {
    return snapshot;
  },
};

export function useStudyState(): StudyState {
  return useSyncExternalStore(
    studyState.subscribe,
    studyState.getSnapshot,
    studyState.getSnapshot
  );
}
