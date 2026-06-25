"use client";

import { useSyncExternalStore } from "react";
import { parseRegions } from "../study/region";
import type { AnalysisRegion, RegionField, StudyResult } from "../study/studyTypes";
import studyRegionsJson from "../../data/study-regions.json";

// The active calendar date and analysis region for the scene and the sun-access
// study (Unit 8), shared by the lighting (which drives the real sun off the date),
// the time-of-day label, the region overlay, and the study itself in later
// increments. Introduced here to close the parked date-picker TODO in Lighting.tsx.
// Result and status join this store as the study is built out.
//
// Defaults to the summer solstice the scene opened on, so the established look is
// unchanged until the user picks another day. The study recommends the autumn
// equinox (DEFAULT_STUDY_DATE in src/study), which is one click away in the control.

export type StudyStatus = "idle" | "running" | "ready";

export type StudyState = {
  date: string; // ISO yyyy-mm-dd, interpreted in America/Toronto
  region: AnalysisRegion; // the open space the study measures, ENU metres
  status: StudyStatus; // study lifecycle, for the panel and the heatmap
  field: RegionField | null; // the computed sun-hours field, null until first run
  result: StudyResult | null; // net-new metric vs the unedited baseline, null until first run
};

const SCENE_OPEN_DATE = "2026-06-21"; // summer solstice, the established opening look

// Seed the region from the authored default over St. James Park. Its exact
// placement is tuned on device through the region gizmo (8.2).
const DEFAULT_REGION =
  parseRegions(studyRegionsJson).find((r) => r.id === "st-james-park") ??
  parseRegions(studyRegionsJson)[0];

const state: StudyState = {
  date: SCENE_OPEN_DATE,
  region: { ...DEFAULT_REGION },
  status: "idle",
  field: null,
  result: null,
};
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
  getRegion(): AnalysisRegion {
    return state.region;
  },
  setRegion(region: AnalysisRegion): void {
    state.region = region;
    emit();
  },
  getField(): RegionField | null {
    return state.field;
  },
  setField(field: RegionField | null): void {
    state.field = field;
    emit();
  },
  setResult(result: StudyResult | null): void {
    state.result = result;
    emit();
  },
  setStatus(status: StudyStatus): void {
    state.status = status;
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
