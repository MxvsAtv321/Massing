import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const BuildingUseSchema = z.enum(["residential", "office", "mixed"]);

// Raw output from the LLM tool: op + optional params. No location, no target —
// the app supplies those from the user's click (ADR-004).
export const LLMOutputSchema = z.object({
  op: z.enum(["AddBuilding", "ModifyBuilding", "RemoveBuilding"]),
  heightStoreys: z.number().int().min(1).max(120).optional(),
  use: BuildingUseSchema.optional(),
});

const AddBuildingSchema = z.object({
  op: z.literal("AddBuilding"),
  heightStoreys: z.number().int().min(1).max(120),
  use: BuildingUseSchema.optional(),
  at: z.tuple([z.number(), z.number()]),
});

const ModifyBuildingSchema = z.object({
  op: z.literal("ModifyBuilding"),
  targetClusterId: z.string().min(1),
  heightStoreys: z.number().int().min(1).max(120),
});

const RemoveBuildingSchema = z.object({
  op: z.literal("RemoveBuilding"),
  targetClusterId: z.string().min(1),
});

export const EditOpSchema = z.discriminatedUnion("op", [
  AddBuildingSchema,
  ModifyBuildingSchema,
  RemoveBuildingSchema,
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type LLMOutput = z.infer<typeof LLMOutputSchema>;
export type AddBuildingOp = z.infer<typeof AddBuildingSchema>;
export type ModifyBuildingOp = z.infer<typeof ModifyBuildingSchema>;
export type RemoveBuildingOp = z.infer<typeof RemoveBuildingSchema>;
export type EditOp = z.infer<typeof EditOpSchema>;

// ─── Click context ────────────────────────────────────────────────────────────

export type ClickContext = {
  // Set when the click hit an existing building cluster.
  clickedClusterId: string | null;
  // Set when the click hit empty ground; ENU [east, north] in metres.
  clickEnu: [number, number] | null;
  // All known cluster IDs in the scene, for ID-existence validation.
  validClusterIds: Set<string>;
};

// ─── Assembly ─────────────────────────────────────────────────────────────────

export class EditAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditAssemblyError";
  }
}

// Combines the LLM output (op + bounded params only) with the app-supplied click
// context to produce a fully resolved, Zod-validated EditOp. Throws
// EditAssemblyError with a user-facing message on any mismatch or missing field.
export function assembleEditOp(raw: LLMOutput, ctx: ClickContext): EditOp {
  const { op, heightStoreys, use } = raw;
  const { clickedClusterId, clickEnu, validClusterIds } = ctx;

  if (op === "AddBuilding") {
    if (clickEnu === null) {
      throw new EditAssemblyError(
        "Click an empty area first to set where to add the building."
      );
    }
    if (heightStoreys === undefined) {
      throw new EditAssemblyError(
        'Specify a height, e.g. "add a 30-storey tower".'
      );
    }
    return EditOpSchema.parse({ op: "AddBuilding", heightStoreys, use, at: clickEnu });
  }

  if (op === "ModifyBuilding") {
    if (clickedClusterId === null) {
      throw new EditAssemblyError(
        "Click a building first to select which one to modify."
      );
    }
    if (!validClusterIds.has(clickedClusterId)) {
      throw new EditAssemblyError(
        `Cluster "${clickedClusterId}" is not in the scene.`
      );
    }
    if (heightStoreys === undefined) {
      throw new EditAssemblyError(
        'Specify a height, e.g. "make it 30 storeys".'
      );
    }
    return EditOpSchema.parse({
      op: "ModifyBuilding",
      targetClusterId: clickedClusterId,
      heightStoreys,
    });
  }

  // RemoveBuilding
  if (clickedClusterId === null) {
    throw new EditAssemblyError(
      "Click a building first to select which one to remove."
    );
  }
  if (!validClusterIds.has(clickedClusterId)) {
    throw new EditAssemblyError(
      `Cluster "${clickedClusterId}" is not in the scene.`
    );
  }
  return EditOpSchema.parse({ op: "RemoveBuilding", targetClusterId: clickedClusterId });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function storeyToMetres(storeys: number, metresPerStorey: number): number {
  return storeys * metresPerStorey;
}

export function buildDiffLine(op: EditOp, metresPerStorey: number): string {
  if (op.op === "AddBuilding") {
    const m = storeyToMetres(op.heightStoreys, metresPerStorey);
    const useStr = op.use ? ` ${op.use}` : "";
    return `Add: ${op.heightStoreys}-storey${useStr}, ~${m} m`;
  }
  if (op.op === "ModifyBuilding") {
    const m = storeyToMetres(op.heightStoreys, metresPerStorey);
    return `Modify: ${op.targetClusterId} -> ${op.heightStoreys} storeys (~${m} m)`;
  }
  return `Remove: cluster ${op.targetClusterId}`;
}
