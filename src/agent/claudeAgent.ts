import Anthropic from "@anthropic-ai/sdk";
import type { Agent, AgentTurn, ToolCall, ToolResult, Placement } from "./types";
import type { Objective } from "./objective";

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
        "Apply one generative op. You never give coordinates: the site, seed, street orientation, and " +
        "the waterfront line are handled for you. DefineDistrict claims the site. LayStreets lays the " +
        "grid (carFree true for a car-free district). FillBlocks fills with buildings and controls " +
        "population via target.unitsPerHa and heightEnvelope. PlaceOpenSpace reserves a park. " +
        "ApplyGradient steps heights down toward the water (field height, anchor waterEdge, direction down).",
      input_schema: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: ["DefineDistrict", "LayStreets", "FillBlocks", "PlaceOpenSpace", "ApplyGradient"],
          },
          district: { type: "string", description: "the district id; use 'd1'" },
          pattern: { type: "string", enum: ["grid", "perimeter"], description: "LayStreets" },
          blockSizeM: { type: "number", description: "LayStreets, 40 to 200 metres" },
          carFree: { type: "boolean", description: "LayStreets; true for a car-free district" },
          program: { type: "string", enum: ["residential", "office", "mixed"], description: "FillBlocks" },
          target: {
            type: "object",
            properties: { unitsPerHa: { type: "number" } },
            description: "FillBlocks: density in units per hectare (50 to 2000). Raise to add population.",
          },
          heightEnvelope: {
            type: "object",
            properties: { minStoreys: { type: "integer" }, maxStoreys: { type: "integer" } },
            description: "FillBlocks: storey range 1 to 120.",
          },
          coverage: { type: "number", description: "FillBlocks: lot coverage 0.1 to 0.9" },
          where: { type: "string", enum: ["central", "waterEdge", "parkCentroid"], description: "PlaceOpenSpace location" },
          areaM2: { type: "number", description: "PlaceOpenSpace park area in m2, at least 500" },
          field: { type: "string", enum: ["height", "density"], description: "ApplyGradient" },
          anchor: { type: "string", enum: ["waterEdge", "parkCentroid"], description: "ApplyGradient anchor" },
          falloffM: { type: "number", description: "ApplyGradient falloff 50 to 2000 metres" },
          falloffShape: { type: "string", enum: ["linear", "smooth"], description: "ApplyGradient; smooth for a graceful descent" },
          direction: { type: "string", enum: ["down", "up"], description: "ApplyGradient; down lowers toward the anchor" },
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
      name: "score_reach",
      description: "Read how reachable the park is on foot for the district's homes: the fraction within the walk-time and the worst-case minutes. Geometry-derived.",
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

export function buildSystemPrompt(vector: Objective[]): string {
  const pop = vector.find((o) => o.kind === "population");
  const reach = vector.find((o) => o.kind === "parkReachMinutes");
  const lines = [
    "You are a city planner conjuring one new district on real Toronto parcels. You design through",
    "generative ops and never give coordinates: the site, seed, street orientation, and the waterfront",
    "line are handled for you.",
    "",
    "The brief:",
  ];
  if (pop && pop.kind === "population") lines.push(`- about ${pop.target} residents`);
  if (reach && reach.kind === "parkReachMinutes")
    lines.push(`- a park reachable within a ${reach.ceiling} minute walk for the homes`);
  lines.push(
    "- car-free streets",
    "- towers stepping down toward the water",
    "",
    "Build with apply_op in this order:",
    '1. DefineDistrict ("d1").',
    '2. LayStreets ("d1", pattern "grid", carFree true).',
    '3. FillBlocks ("d1", residential, a target.unitsPerHa and heightEnvelope sized to the population).',
    '4. PlaceOpenSpace ("d1", where "central") for the park.',
    '5. ApplyGradient ("d1", field "height", anchor "waterEdge", direction "down", falloffShape "smooth").',
    "",
    'After building, read score_units (population) and score_reach (the walk to the park, districtId "d1").',
    "Adjust to meet the brief: raise density or height for more people; the park's size and central",
    "placement drive reachability. You will be told when all objectives are met.",
    "",
    "These objectives are in genuine tension: more people means taller, denser blocks. If you cannot",
    "meet them all at once, find the best balance you can and call finish, and in your final message",
    "state plainly which you met and which you traded and by how much (for example: 'forty thousand",
    "would have pushed the park past a five minute walk, so I held at thirty-four thousand to keep it",
    "reachable'). Be decisive: do not keep adjusting once you are close or have found the best balance.",
  );
  return lines.join("\n");
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
