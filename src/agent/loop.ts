import { executeTool } from "./dispatch";
import { withinTolerance, type Sandbox } from "./sandbox";
import type { Agent, Emit, PopulationGoal, ToolResult } from "./types";
import type { GenerativeOp } from "../generate/op";

// The agent loop (G5): drive the Agent, execute its tool calls against the sandbox, stream accepted
// ops, and stop the moment the population is inside tolerance, the budget is spent, or the agent
// finishes. The within-tolerance stop is mechanical, not left to the agent, so the convergence reads
// decisive (it does not chase the last few units after effectively hitting the number). Generic over
// Agent, so a scripted agent proves termination, budget, streaming, and the stop rule with no LLM.

export type LoopResult = {
  converged: boolean;
  reason: string;
  iterations: number;
  ops: GenerativeOp[];
  signature: string;
};

export async function runLoop(
  agent: Agent,
  sandbox: Sandbox,
  goal: PopulationGoal,
  budget: number,
  emit: Emit
): Promise<LoopResult> {
  let iterations = 0;
  let converged = false;
  let reason = "budget";

  outer: while (iterations < budget) {
    const turn = await agent.next();
    iterations++;
    if (turn.text) emit({ type: "status", text: turn.text });
    if (turn.toolCalls.length === 0) {
      reason = "agent idle";
      break;
    }

    const results: ToolResult[] = [];
    for (const tc of turn.toolCalls) {
      if (tc.name === "finish") {
        results.push({ id: tc.id, content: "acknowledged" });
        reason = "agent finished";
        agent.observe(results);
        break outer;
      }

      const r = executeTool(sandbox, tc.name, tc.input);
      results.push({ id: tc.id, content: JSON.stringify(r.content), isError: !r.ok });

      if (tc.name === "apply_op" && r.ok && r.op) {
        emit({ type: "op", op: r.op });
        // Decisive stop: the moment the proposal is within tolerance, finish; do not keep fiddling.
        if (withinTolerance(sandbox.totalPopulation(), goal.population, goal.tolFrac)) {
          converged = true;
          reason = "within tolerance";
          agent.observe(results);
          break outer;
        }
      } else if (tc.name.startsWith("score_") && r.ok) {
        emit({ type: "score", tool: tc.name, score: r.content });
      }
    }
    agent.observe(results);
  }

  const ops = sandbox.ops();
  const signature = sandbox.signatureAll();
  emit({ type: "done", ops, signature, converged, reason });
  return { converged, reason, iterations, ops, signature };
}
