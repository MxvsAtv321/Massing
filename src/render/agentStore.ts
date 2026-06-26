"use client";

import { useSyncExternalStore } from "react";

// The agent run's state, bridged from the SSE consumer (agentClient) to the DOM panel (CanvasClient)
// and never touched in the Canvas tree, the same imperative-store pattern as studyStore and editHud.
// The signature field is the G5 gate: did the city the client rendered match the one the agent scored.

export type SignatureCheck = "match" | "mismatch" | "unknown";

export type AgentState = {
  running: boolean;
  status: string;
  reason: string;
  converged: boolean;
  populationTarget: number | null;
  serverSignature: string;
  clientSignature: string;
  signature: SignatureCheck | null;
};

const state: AgentState = {
  running: false,
  status: "",
  reason: "",
  converged: false,
  populationTarget: null,
  serverSignature: "",
  clientSignature: "",
  signature: null,
};
let snapshot: AgentState = { ...state };
const listeners = new Set<() => void>();
function emit(): void {
  snapshot = { ...state };
  for (const l of listeners) l();
}

export const agentState = {
  get(): AgentState {
    return snapshot;
  },
  start(target: number): void {
    state.running = true;
    state.status = "thinking";
    state.reason = "";
    state.converged = false;
    state.populationTarget = target;
    state.serverSignature = "";
    state.clientSignature = "";
    state.signature = null;
    emit();
  },
  setStatus(s: string): void {
    state.status = s;
    emit();
  },
  finish(p: { reason: string; converged: boolean; serverSignature: string; clientSignature: string }): void {
    state.running = false;
    state.reason = p.reason;
    state.converged = p.converged;
    state.serverSignature = p.serverSignature;
    state.clientSignature = p.clientSignature;
    state.signature = !p.serverSignature
      ? "unknown"
      : p.serverSignature === p.clientSignature
        ? "match"
        : "mismatch";
    emit();
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

export function useAgentState(): AgentState {
  return useSyncExternalStore(agentState.subscribe, agentState.get, agentState.get);
}
