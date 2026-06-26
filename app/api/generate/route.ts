import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildServerContext } from "../../../src/agent/serverContext";
import { Sandbox } from "../../../src/agent/sandbox";
import { runLoop } from "../../../src/agent/loop";
import { executeTool } from "../../../src/agent/dispatch";
import {
  ClaudeAgent,
  buildTools,
  buildSystemPrompt,
  prepareOp,
  type Placement,
} from "../../../src/agent/claudeAgent";

// The generative agent loop (G5b, ADR-R21): server-side Claude tool-use over the sandbox, the same
// pure expander and scorers, streamed to the client as SSE. The placement (region, seed, bearing) is
// injected into the agent's ops here, so the model never emits a coordinate (the spine). The client
// re-expands the streamed ops and compares its geometry signature to the one in the `done` event.

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  populationTarget: number;
  region: Placement["region"];
  seed: number;
  bearingDeg: number;
};

const BUDGET = 14;
const TOL_FRAC = 0.05;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured (add it to .env.local)" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }

  const placement: Placement = { region: body.region, seed: body.seed, bearingDeg: body.bearingDeg };

  // All setup runs inside the stream so any failure (context load, model call, loop) comes back as a
  // visible `error:` event rather than an opaque 500, which is what makes this debuggable on device.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        emit({ type: "status", text: "loading city context" });
        const { ctx, opts } = await buildServerContext();
        const sandbox = new Sandbox(ctx, opts);
        const client = new Anthropic({ apiKey });
        const agent = new ClaudeAgent(
          client,
          buildSystemPrompt(body.populationTarget),
          buildTools(),
          "Build the residential district to the population goal."
        );
        const dispatch = (sb: Sandbox, name: string, input: unknown) =>
          executeTool(sb, name, name === "apply_op" ? prepareOp(input, placement) : input);

        await runLoop(
          agent,
          sandbox,
          { population: body.populationTarget, tolFrac: TOL_FRAC },
          BUDGET,
          emit,
          dispatch
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        emit({ type: "status", text: `error: ${message}` });
        emit({ type: "done", ops: [], signature: "", converged: false, reason: `error: ${message}` });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
