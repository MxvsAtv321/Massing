import Anthropic from "@anthropic-ai/sdk";
import type { Agent, AgentTurn, ToolCall, ToolResult, Placement } from "./types";

// The real-Claude implementation of the Agent interface (G5b). It keeps its own Anthropic message
// history; the loop drives it the same way it drives the scripted agent. The agent never emits a
// coordinate: the region, seed, and street bearing are injected by the route (prepareOp), honoring the
// spine (ADR-R17). G5 exposes the population-relevant tools; G6 adds the full score vector.

export type { Placement };

export function prepareOp(input: unknown, placement: Placement): unknown {
  const o = (input ?? {}) as Record<string, unknown>;
  if (o.op === "DefineDistrict") return { ...o, region: placement.region, seed: placement.seed };
  if (o.op === "LayStreets") return { ...o, primaryAxis: { kind: "bearing", deg: placement.bearingDeg } };
  return input;
}

export function buildTools(): Anthropic.Tool[] {
  return [
    {
      name: "apply_op",
      description:
        "Apply one generative op to the district. You never give coordinates: the site, seed, and " +
        "street orientation are handled for you. DefineDistrict claims the site. LayStreets lays the " +
        "grid. FillBlocks fills it with buildings and is how you control population, through the " +
        "density (target.unitsPerHa) and the height (heightEnvelope).",
      input_schema: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["DefineDistrict", "LayStreets", "FillBlocks"] },
          district: { type: "string", description: "the district id; use 'd1'" },
          pattern: { type: "string", enum: ["grid", "perimeter"], description: "LayStreets only" },
          blockSizeM: { type: "number", description: "LayStreets only, 40 to 200 metres" },
          carFree: { type: "boolean", description: "LayStreets only" },
          program: { type: "string", enum: ["residential", "office", "mixed"], description: "FillBlocks only" },
          target: {
            type: "object",
            properties: { unitsPerHa: { type: "number" } },
            description: "FillBlocks: density in units per hectare (50 to 2000). Raise to add population.",
          },
          heightEnvelope: {
            type: "object",
            properties: { minStoreys: { type: "integer" }, maxStoreys: { type: "integer" } },
            description: "FillBlocks: storey range 1 to 120. Set min equal to max for a uniform height.",
          },
          coverage: { type: "number", description: "FillBlocks: lot coverage 0.1 to 0.9" },
        },
        required: ["op", "district"],
      },
    },
    {
      name: "score_units",
      description: "Read the achieved unit count and resident population of a district. Geometry-derived.",
      input_schema: {
        type: "object",
        properties: { districtId: { type: "string" } },
        required: ["districtId"],
      },
    },
    {
      name: "finish",
      description: "Signal that the district is within tolerance of the population target and you are done.",
      input_schema: { type: "object", properties: {} },
    },
  ];
}

export function buildSystemPrompt(populationTarget: number): string {
  return [
    "You are a city planner building one residential district to a population target. You design",
    "through generative ops and never specify coordinates: the location, seed, and street orientation",
    "are handled for you.",
    "",
    `Goal: about ${populationTarget} residents.`,
    "",
    "Build in this order, each through apply_op:",
    '1. DefineDistrict (district "d1").',
    '2. LayStreets (district "d1", pattern "grid", carFree true, blockSizeM about 80).',
    '3. FillBlocks (district "d1", program "residential", a target.unitsPerHa, a heightEnvelope, coverage about 0.45).',
    "",
    'Then call score_units (districtId "d1") to read the achieved population. If it is below the target,',
    "raise the density (unitsPerHa) or the height (heightEnvelope storeys) and apply FillBlocks again; if",
    "it is above, lower them. Population rises with both density and height.",
    "",
    "Call finish as soon as the population is within about 5 percent of the target. Be decisive: do not",
    "keep adjusting once you are close.",
  ].join("\n");
}

export class ClaudeAgent implements Agent {
  private messages: Anthropic.MessageParam[] = [];

  constructor(
    private client: Anthropic,
    private system: string,
    private tools: Anthropic.Tool[],
    firstUserText: string
  ) {
    this.messages.push({ role: "user", content: firstUserText });
  }

  async next(): Promise<AgentTurn> {
    const resp = await this.client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
      tools: this.tools,
      messages: this.messages,
    });
    this.messages.push({ role: "assistant", content: resp.content });

    let text: string | null = null;
    const toolCalls: ToolCall[] = [];
    for (const block of resp.content) {
      if (block.type === "text") text = (text ?? "") + block.text;
      else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
    return { text, toolCalls };
  }

  observe(results: ToolResult[]): void {
    this.messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
        is_error: r.isError,
      })),
    });
  }
}
