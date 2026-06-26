import type { Agent, AgentTurn, ToolResult } from "./types";

// A canned agent for headless tests and dev: replays a fixed list of turns, ignoring the messages a
// real model would condition on. It is what lets the loop's deterministic plumbing (termination,
// budget, streaming, the stop-when-inside-tolerance rule) be proven with no LLM, no key, no cost. The
// real Claude agent (the route, G5b) implements the same Agent interface.
export class ScriptedAgent implements Agent {
  private i = 0;
  readonly observed: ToolResult[][] = [];

  constructor(private turns: AgentTurn[]) {}

  async next(): Promise<AgentTurn> {
    return this.turns[this.i++] ?? { text: null, toolCalls: [] };
  }

  observe(results: ToolResult[]): void {
    this.observed.push(results);
  }
}
