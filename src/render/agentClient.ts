"use client";

import { emptyOverlay } from "../mutation/applyEdit";
import { applyGenerativeOps } from "../generate/overlay";
import { expandDistrict, geometrySignature, type ExpandOpts } from "../generate/expand";
import { GenerativeOpSchema, type GenerativeOp } from "../generate/op";
import type { GenerativeContext } from "../generate/types";
import type { Placement } from "../agent/types";
import { agentState } from "./agentStore";

// Drive a generative agent run from the client: POST the goal, consume the SSE stream, feed each
// accepted op into the renderer as it arrives (so the build is watched live), and on `done` compute
// the geometry signature of what the client rendered and compare it to the server's. A mismatch is the
// silent moat-breaker (the agent optimized a city the user is not seeing), so it is surfaced loudly.

export type StartAgentArgs = {
  populationTarget: number;
  placement: Placement;
  ctx: GenerativeContext;
  expandOpts: ExpandOpts;
  onOps: (ops: GenerativeOp[]) => void;
};

export async function startAgent(args: StartAgentArgs): Promise<void> {
  const { populationTarget, placement, ctx, expandOpts, onOps } = args;
  agentState.start(populationTarget);

  const accumulated: GenerativeOp[] = [];
  let serverSignature = "";
  let reason = "ended";
  let converged = false;

  let resp: Response;
  try {
    resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        populationTarget,
        region: placement.region,
        seed: placement.seed,
        bearingDeg: placement.bearingDeg,
      }),
    });
  } catch {
    agentState.setStatus("network error");
    agentState.finish({ reason: "error", converged: false, serverSignature: "", clientSignature: "" });
    return;
  }
  if (!resp.ok || !resp.body) {
    agentState.setStatus(`error ${resp.status}`);
    agentState.finish({ reason: "error", converged: false, serverSignature: "", clientSignature: "" });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      let ev: { type?: string; [k: string]: unknown };
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (ev.type === "status") {
        agentState.setStatus(String(ev.text ?? ""));
      } else if (ev.type === "op") {
        const parsed = GenerativeOpSchema.safeParse(ev.op);
        if (parsed.success) {
          accumulated.push(parsed.data);
          onOps(accumulated.slice());
        }
      } else if (ev.type === "done") {
        serverSignature = String(ev.signature ?? "");
        reason = String(ev.reason ?? "ended");
        converged = Boolean(ev.converged);
      }
    }
  }

  const clientSignature = clientSignatureOf(accumulated, ctx, expandOpts);
  if (serverSignature && clientSignature !== serverSignature) {
    console.warn("[agent] SIGNATURE MISMATCH (the rendered city is not the one the agent scored)\n server:", serverSignature, "\n client:", clientSignature);
  } else if (serverSignature) {
    console.log("[agent] signature match: client render equals server score");
  }
  agentState.finish({ reason, converged, serverSignature, clientSignature });
}

// Re-expand the same op sequence the client rendered and hash it, in the format the server uses
// (sandbox.signatureAll): districts sorted by id, "id:signature", joined by "||".
function clientSignatureOf(
  ops: GenerativeOp[],
  ctx: GenerativeContext,
  expandOpts: ExpandOpts
): string {
  let overlay = emptyOverlay();
  try {
    overlay = applyGenerativeOps(overlay, ops, ctx);
  } catch {
    return "";
  }
  const ids = overlay.generatedDistricts.map((d) => d.id).sort();
  return ids
    .map((id) => {
      const d = overlay.generatedDistricts.find((x) => x.id === id)!;
      try {
        return `${id}:${geometrySignature(expandDistrict(d, ctx, expandOpts))}`;
      } catch {
        return `${id}:ERR`;
      }
    })
    .join("||");
}
