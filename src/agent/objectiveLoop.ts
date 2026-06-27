import { executeTool } from "./dispatch";
import { evaluateVector, satisfaction, isBetter, type Objective, type ObjectiveValues, type VectorEvaluation } from "./objective";
import type { Sandbox } from "./sandbox";
import type { Dispatch } from "./loop";
import type { Agent, Emit, ToolResult } from "./types";
import type { GenerativeOp } from "../generate/op";

// The multi-objective agent loop (G6). It surfaces the objective evaluation back to the agent after
// every build (met or traded, with shortfalls), so the agent reasons about the tradeoff and presents
// it. Three ways to stop, in order of how the demo should read: all objectives met (decisive, the G5
// discipline); the agent calls finish, having reached the best balance it can and stating the trades
// in its own words; or a backstop, a stall (no improvement for stallLimit builds) or the budget. The
// scored vector is geometry-derived only; car-free and step-down are construction invariants, never
// here. Generic over Agent and over readValues, so a scripted agent proves it with no model.

export type ReadValues = (sandbox: Sandbox, districtId: string) => ObjectiveValues;

export type ObjectiveLoopResult = {
  converged: boolean;
  reason: string;
  iterations: number;
  ops: GenerativeOp[];
  signature: string;
  evaluation: VectorEvaluation | null;
};

export async function runObjectiveLoop(
  agent: Agent,
  sandbox: Sandbox,
  vector: Objective[],
  districtId: string,
  budget: number,
  stallLimit: number,
  emit: Emit,
  readValues: ReadValues,
  dispatch: Dispatch = executeTool
): Promise<ObjectiveLoopResult> {
  let iterations = 0;
  let converged = false;
  let reason = "budget";
  let stalls = 0;
  let best = { metCount: -1, totalShortfallFrac: Infinity };
  let lastEval: VectorEvaluation | null = null;

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

      const r = dispatch(sandbox, tc.name, tc.input);
      let content: unknown = r.content;

      if (tc.name === "apply_op" && r.ok && r.op) {
        emit({ type: "op", op: r.op });
        const ev = evaluateVector(readValues(sandbox, districtId), vector);
        lastEval = ev;
        content = { ...(r.content as object), objectives: ev };
        emit({ type: "objectives", evaluation: ev });

        const s = satisfaction(ev);
        if (isBetter(s, best)) {
          best = s;
          stalls = 0;
        } else {
          stalls++;
        }

        if (ev.allMet) {
          converged = true;
          reason = "all objectives met";
          results.push({ id: tc.id, content: JSON.stringify(content) });
          agent.observe(results);
          break outer;
        }
        if (stalls >= stallLimit) {
          reason = "best balance (objectives traded)";
          results.push({ id: tc.id, content: JSON.stringify(content) });
          agent.observe(results);
          break outer;
        }
      } else if (tc.name.startsWith("score_") && r.ok) {
        emit({ type: "score", tool: tc.name, score: r.content });
      }

      results.push({ id: tc.id, content: JSON.stringify(content), isError: !r.ok });
    }
    agent.observe(results);
  }

  const ops = sandbox.ops();
  const signature = sandbox.signatureAll();
  emit({ type: "done", ops, signature, converged, reason, evaluation: lastEval ?? undefined });
  return { converged, reason, iterations, ops, signature, evaluation: lastEval };
}
