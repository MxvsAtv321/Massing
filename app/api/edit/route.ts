import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  LLMOutputSchema,
  assembleEditOp,
  EditAssemblyError,
  type ClickContext,
} from "../../../src/mutation/editOp";

// ─── Request / response types ─────────────────────────────────────────────────

type NearbyCluster = { id: string; heightM: number };

type SceneContext = {
  clickedClusterId: string | null;
  clickEnu: [number, number] | null;
  nearbyClusters: NearbyCluster[];
  validClusterIds: string[];
};

type EditRequestBody = {
  userText: string;
  sceneContext: SceneContext;
};

// ─── LLM tool definition ──────────────────────────────────────────────────────
// targetClusterId is intentionally absent: the app sets the target from the
// click (ADR-004), so the LLM never resolves spatial references.

const EDIT_TOOL: Anthropic.Tool = {
  name: "edit_building",
  description:
    "Emit a single building edit operation. " +
    "AddBuilding: adds a new building at the clicked empty-ground location. " +
    "ModifyBuilding: changes the clicked building's height. " +
    "RemoveBuilding: removes the clicked building. " +
    "Do not include targetClusterId; the app supplies the target from the click.",
  input_schema: {
    type: "object",
    properties: {
      op: {
        type: "string",
        enum: ["AddBuilding", "ModifyBuilding", "RemoveBuilding"],
        description: "Operation type.",
      },
      heightStoreys: {
        type: "integer",
        minimum: 1,
        maximum: 120,
        description:
          "Height in whole storeys. Required for AddBuilding and ModifyBuilding.",
      },
      use: {
        type: "string",
        enum: ["residential", "office", "mixed"],
        description: "Building use type. Optional; only relevant for AddBuilding.",
      },
    },
    required: ["op"],
  },
};

// ─── Context block builder ────────────────────────────────────────────────────

function buildContextBlock(sc: SceneContext): string {
  const lines: string[] = ["Scene context:"];

  if (sc.clickedClusterId !== null) {
    const nearby = sc.nearbyClusters.find((c) => c.id === sc.clickedClusterId);
    const heightStr = nearby ? ` (~${Math.round(nearby.heightM)} m tall)` : "";
    lines.push(`  Clicked building: cluster ${sc.clickedClusterId}${heightStr}.`);
    lines.push("  Use ModifyBuilding or RemoveBuilding for this cluster.");
  } else if (sc.clickEnu !== null) {
    const [e, n] = sc.clickEnu;
    lines.push(
      `  Clicked location: empty ground at E=${e.toFixed(0)} m, N=${n.toFixed(0)} m.`
    );
    lines.push("  Use AddBuilding for a new tower at this location.");
  } else {
    lines.push("  No click target yet.");
  }

  if (sc.nearbyClusters.length > 0) {
    lines.push("  Nearby buildings:");
    for (const c of sc.nearbyClusters) {
      lines.push(`    - ${c.id}: ~${Math.round(c.heightM)} m`);
    }
  }

  return lines.join("\n");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured — add it to .env.local" },
      { status: 503 }
    );
  }

  let body: EditRequestBody;
  try {
    body = (await req.json()) as EditRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { userText, sceneContext } = body;
  if (!userText || typeof userText !== "string") {
    return NextResponse.json({ ok: false, error: "userText is required" }, { status: 400 });
  }

  const contextBlock = buildContextBlock(sceneContext);
  const prompt =
    `You are helping a user edit a 3D city model of Toronto's St. Lawrence neighbourhood.\n\n` +
    `${contextBlock}\n\n` +
    `User request: "${userText}"\n\n` +
    `Call edit_building with the appropriate operation.`;

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      tools: [EDIT_TOOL],
      tool_choice: { type: "tool", name: "edit_building" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json(
        { ok: false, error: "No tool_use block in LLM response" },
        { status: 500 }
      );
    }

    const llmParsed = LLMOutputSchema.safeParse(toolBlock.input);
    if (!llmParsed.success) {
      return NextResponse.json(
        { ok: false, error: `LLM output failed schema: ${llmParsed.error.message}` },
        { status: 422 }
      );
    }

    const clickCtx: ClickContext = {
      clickedClusterId: sceneContext.clickedClusterId,
      clickEnu: sceneContext.clickEnu,
      validClusterIds: new Set(sceneContext.validClusterIds),
    };

    const op = assembleEditOp(llmParsed.data, clickCtx);
    return NextResponse.json({ ok: true, op });
  } catch (err) {
    if (err instanceof EditAssemblyError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
