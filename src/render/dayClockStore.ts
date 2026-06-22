"use client";

import { useSyncExternalStore } from "react";
import { advanceMinutes, wrapDay } from "./dayClock";

// A tiny external store bridging the canvas and the DOM control without a new
// dependency. The canvas owns time: it calls tick() every frame and reads the
// live minutes directly (no React render per frame). The DOM control subscribes
// and is only notified when the displayed minute changes, so it re-renders at
// about 1 Hz, not 60.

export type ClockState = {
  minutes: number; // position in the day, [0, 1440)
  playing: boolean;
  speed: number; // sim minutes per real second
};

// Open paused at the Unit 1/2 golden-hour instant so the scene reads exactly as
// before until the user presses play or scrubs.
const GOLDEN_HOUR_MINUTES = 19 * 60 + 15;

const state: ClockState = {
  minutes: GOLDEN_HOUR_MINUTES,
  playing: false,
  speed: 48, // a full day in 30 real seconds
};

let snapshot: ClockState = { ...state };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { ...state };
  for (const l of listeners) l();
}

export const dayClock = {
  // Called by the canvas each frame. Advances when playing and returns the live
  // minutes. Notifies DOM subscribers only when the integer minute changes.
  tick(dtSeconds: number): number {
    if (state.playing) {
      const before = Math.floor(state.minutes);
      state.minutes = advanceMinutes(state.minutes, dtSeconds, state.speed);
      if (Math.floor(state.minutes) !== before) emit();
    }
    return state.minutes;
  },
  getMinutes(): number {
    return state.minutes;
  },
  setMinutes(m: number): void {
    state.minutes = wrapDay(m);
    emit();
  },
  setPlaying(p: boolean): void {
    state.playing = p;
    emit();
  },
  setSpeed(s: number): void {
    state.speed = s;
    emit();
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot(): ClockState {
    return snapshot;
  },
};

export function useDayClock(): ClockState {
  return useSyncExternalStore(
    dayClock.subscribe,
    dayClock.getSnapshot,
    dayClock.getSnapshot
  );
}
