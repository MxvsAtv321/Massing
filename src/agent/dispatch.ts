import { GenerativeOpSchema, type GenerativeOp } from "../generate/op";
import type { Sandbox } from "./sandbox";

// The tool dispatcher: a tool call (name + input) becomes a sandbox op or score. The op is strictly
// Zod-validated here, so a malformed op from the model is a tool error the agent can read and retry,
// never bad geometry. The same six tools the route exposes to Claude (G5b); the loop and tests drive
// this directly with a scripted agent.

export const TOOL_NAMES = [
  "apply_op",
  "score_units",
  "score_sun",
  "score_reach",
  "score_traffic",
  "finish",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type DispatchResult = { ok: boolean; content: unknown; op?: GenerativeOp };

export function executeTool(sandbox: Sandbox, name: string, input: unknown): DispatchResult {
  if (name === "apply_op") {
    const parsed = GenerativeOpSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, content: { error: `invalid op: ${parsed.error.message}` } };
    }
    const r = sandbox.applyOp(parsed.data);
    if (!r.ok) return { ok: false, content: { error: r.error } };
    return {
      ok: true,
      content: { districtId: r.districtId, buildingCount: r.buildingCount, gateConnected: r.gateConnected },
      op: r.op,
    };
  }

  if (name === "score_units" || name === "score_sun" || name === "score_reach" || name === "score_traffic") {
    const kind = name.slice("score_".length) as "units" | "sun" | "reach" | "traffic";
    const districtId = (input as { districtId?: unknown } | null)?.districtId;
    if (typeof districtId !== "string") {
      return { ok: false, content: { error: "districtId (string) required" } };
    }
    const r = sandbox.score(kind, districtId);
    if (!r.ok) return { ok: false, content: { error: r.error } };
    return { ok: true, content: r.score };
  }

  return { ok: false, content: { error: `unknown tool ${name}` } };
}
