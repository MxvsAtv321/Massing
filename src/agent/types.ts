import type { GenerativeOp } from "../generate/op";

// The agent loop's type surface (G5). The loop is generic over Agent so the entire read-score-refine-
// stream machinery runs headless with a scripted agent (no LLM, no key, no cost); the route injects
// the real Claude client. This separates the deterministic plumbing from the nondeterministic model,
// and is what lets the loop be gated like everything else in the project.

export type ToolCall = { id: string; name: string; input: unknown };
export type ToolResult = { id: string; content: string; isError?: boolean };
export type AgentTurn = { text: string | null; toolCalls: ToolCall[] };

// Stateful so the real agent keeps its own Anthropic message history while the loop stays agnostic.
export interface Agent {
  next(): Promise<AgentTurn>;
  observe(results: ToolResult[]): void;
}

// G5 targets one dimension: a population target with a tolerance. The loop stops the moment it is
// inside tolerance (decisive), rather than letting the agent fiddle after it has hit the number.
export type PopulationGoal = { population: number; tolFrac: number };

// SSE events streamed to the client. The client applies `op` events to its overlay and re-expands.
export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "op"; op: GenerativeOp }
  | { type: "score"; tool: string; score: unknown }
  | { type: "done"; ops: GenerativeOp[]; signature: string; converged: boolean; reason: string };

export type Emit = (e: StreamEvent) => void;
