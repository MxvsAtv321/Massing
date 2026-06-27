"use client";

import { useSyncExternalStore } from "react";
import type { VectorEvaluation } from "../agent/objective";

// The agent run's state, bridged from the SSE consumer (agentClient) to the DOM panel (CanvasClient)
// and never touched in the Canvas tree, the same imperative-store pattern as studyStore and editHud.
// The signature field is the G5 gate: did the city the client rendered match the one the agent scored.
// The evaluation (G6) is the objective vector, each met or traded with its shortfall.

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
  evaluation: VectorEvaluation | null;
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
  evaluation: null,
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
    state.evaluation = null;
    emit();
  },
  setStatus(s: string): void {
    state.status = s;
    emit();
  },
  setEvaluation(ev: VectorEvaluation): void {
    state.evaluation = ev;
    emit();
  },
  finish(p: {
    reason: string;
    converged: boolean;
    serverSignature: string;
    clientSignature: string;
    evaluation: VectorEvaluation | null;
  }): void {
    state.running = false;
    state.reason = p.reason;
    state.converged = p.converged;
    state.serverSignature = p.serverSignature;
    state.clientSignature = p.clientSignature;
    if (p.evaluation) state.evaluation = p.evaluation;
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
