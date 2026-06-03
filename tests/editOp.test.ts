import { describe, it, expect } from "vitest";
import {
  LLMOutputSchema,
  assembleEditOp,
  EditAssemblyError,
  storeyToMetres,
  buildDiffLine,
  type ClickContext,
  type EditOp,
} from "../src/mutation/editOp";
import {
  applyOpToOverlay,
  computeEffectiveBuildings,
  replayLog,
  emptyOverlay,
  buildHypotheticalBuilding,
} from "../src/mutation/applyEdit";
import type { BuildingForScene } from "../src/scene/buildings";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const METRES_PER_STOREY = 3.0;

// Ground click: empty lot, no building under cursor.
const GROUND_CLICK: ClickContext = {
  clickedClusterId: null,
  clickEnu: [10, 20],
  validClusterIds: new Set(["c0", "c1"]),
};

// Building click: cursor hit cluster c0.
const BUILDING_CLICK: ClickContext = {
  clickedClusterId: "c0",
  clickEnu: null,
  validClusterIds: new Set(["c0", "c1"]),
};

function makeBuilding(
  id: string,
  clusterId: string,
  heightValue: number
): BuildingForScene {
  return {
    id,
    footprint: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    heightValue,
    clusterId,
    confidenceKind: "measured",
  };
}

// ─── LLMOutputSchema ──────────────────────────────────────────────────────────

describe("LLMOutputSchema", () => {
  it("rejects heightStoreys < 1", () => {
    expect(LLMOutputSchema.safeParse({ op: "AddBuilding", heightStoreys: 0 }).success).toBe(false);
  });

  it("rejects heightStoreys > 120", () => {
    expect(LLMOutputSchema.safeParse({ op: "AddBuilding", heightStoreys: 121 }).success).toBe(false);
  });

  it("accepts AddBuilding with valid storeys and use", () => {
    const r = LLMOutputSchema.safeParse({ op: "AddBuilding", heightStoreys: 30, use: "residential" });
    expect(r.success).toBe(true);
  });

  it("accepts RemoveBuilding with no heightStoreys", () => {
    expect(LLMOutputSchema.safeParse({ op: "RemoveBuilding" }).success).toBe(true);
  });

  it("rejects unknown op", () => {
    expect(LLMOutputSchema.safeParse({ op: "DemolishCity" }).success).toBe(false);
  });
});

// ─── assembleEditOp ───────────────────────────────────────────────────────────

describe("assembleEditOp — AddBuilding", () => {
  it("succeeds with ground click and storeys", () => {
    const op = assembleEditOp({ op: "AddBuilding", heightStoreys: 30 }, GROUND_CLICK);
    expect(op.op).toBe("AddBuilding");
    if (op.op === "AddBuilding") {
      expect(op.heightStoreys).toBe(30);
      expect(op.at).toEqual([10, 20]);
    }
  });

  it("throws when no ground click (building was clicked instead)", () => {
    expect(() =>
      assembleEditOp({ op: "AddBuilding", heightStoreys: 30 }, BUILDING_CLICK)
    ).toThrow(EditAssemblyError);
  });

  it("throws when heightStoreys is missing", () => {
    expect(() =>
      assembleEditOp({ op: "AddBuilding" }, GROUND_CLICK)
    ).toThrow(EditAssemblyError);
  });
});

describe("assembleEditOp — ModifyBuilding", () => {
  it("succeeds with building click and storeys", () => {
    const op = assembleEditOp({ op: "ModifyBuilding", heightStoreys: 20 }, BUILDING_CLICK);
    expect(op.op).toBe("ModifyBuilding");
    if (op.op === "ModifyBuilding") {
      expect(op.targetClusterId).toBe("c0");
      expect(op.heightStoreys).toBe(20);
    }
  });

  it("throws when no building was clicked", () => {
    expect(() =>
      assembleEditOp({ op: "ModifyBuilding", heightStoreys: 20 }, GROUND_CLICK)
    ).toThrow(EditAssemblyError);
  });

  it("throws when heightStoreys is missing", () => {
    expect(() =>
      assembleEditOp({ op: "ModifyBuilding" }, BUILDING_CLICK)
    ).toThrow(EditAssemblyError);
  });

  it("throws when clicked cluster id is not in the scene", () => {
    const ctx: ClickContext = { ...BUILDING_CLICK, clickedClusterId: "c999" };
    expect(() =>
      assembleEditOp({ op: "ModifyBuilding", heightStoreys: 10 }, ctx)
    ).toThrow(EditAssemblyError);
  });
});

describe("assembleEditOp — RemoveBuilding", () => {
  it("succeeds with building click", () => {
    const op = assembleEditOp({ op: "RemoveBuilding" }, BUILDING_CLICK);
    expect(op.op).toBe("RemoveBuilding");
    if (op.op === "RemoveBuilding") {
      expect(op.targetClusterId).toBe("c0");
    }
  });

  it("throws when no building was clicked", () => {
    expect(() =>
      assembleEditOp({ op: "RemoveBuilding" }, GROUND_CLICK)
    ).toThrow(EditAssemblyError);
  });

  it("throws when clicked cluster id is not in the scene", () => {
    const ctx: ClickContext = { ...BUILDING_CLICK, clickedClusterId: "c999" };
    expect(() =>
      assembleEditOp({ op: "RemoveBuilding" }, ctx)
    ).toThrow(EditAssemblyError);
  });
});

// ─── storeyToMetres ───────────────────────────────────────────────────────────

describe("storeyToMetres", () => {
  it("uses sources.metresPerStorey correctly", () => {
    expect(storeyToMetres(30, METRES_PER_STOREY)).toBe(90);
    expect(storeyToMetres(1, METRES_PER_STOREY)).toBe(3);
  });
});

// ─── buildHypotheticalBuilding ────────────────────────────────────────────────

describe("buildHypotheticalBuilding", () => {
  it("sets origin=user-edit and confidence.kind=hypothetical", () => {
    const op = assembleEditOp({ op: "AddBuilding", heightStoreys: 30 }, GROUND_CLICK);
    if (op.op !== "AddBuilding") throw new Error("wrong op");
    const b = buildHypotheticalBuilding(op, METRES_PER_STOREY, 0);
    expect(b.origin).toBe("user-edit");
    expect(b.confidence.kind).toBe("hypothetical");
    expect(b.heightValue).toBe(90);
    expect(b.clusterId).toBe("user-c0");
  });

  it("uses addIndex for deterministic ids", () => {
    const op = assembleEditOp({ op: "AddBuilding", heightStoreys: 10 }, GROUND_CLICK);
    if (op.op !== "AddBuilding") throw new Error("wrong op");
    const b0 = buildHypotheticalBuilding(op, METRES_PER_STOREY, 0);
    const b1 = buildHypotheticalBuilding(op, METRES_PER_STOREY, 1);
    expect(b0.id).toBe("user-b0");
    expect(b1.id).toBe("user-b1");
  });
});

// ─── applyOpToOverlay ─────────────────────────────────────────────────────────

describe("applyOpToOverlay — AddBuilding", () => {
  it("appends a hypothetical building to the overlay", () => {
    const op = assembleEditOp({ op: "AddBuilding", heightStoreys: 30 }, GROUND_CLICK);
    const overlay = applyOpToOverlay(emptyOverlay(), op, new Map(), METRES_PER_STOREY, 0);
    expect(overlay.addedBuildings).toHaveLength(1);
    expect(overlay.addedBuildings[0].origin).toBe("user-edit");
    expect(overlay.addedBuildings[0].heightValue).toBe(90);
  });
});

describe("applyOpToOverlay — ModifyBuilding", () => {
  it("records new representative height for the cluster", () => {
    const op = assembleEditOp({ op: "ModifyBuilding", heightStoreys: 30 }, BUILDING_CLICK);
    const overlay = applyOpToOverlay(emptyOverlay(), op, new Map(), METRES_PER_STOREY, 0);
    expect(overlay.modifiedClusterHeights.get("c0")).toBe(90);
  });
});

describe("applyOpToOverlay — RemoveBuilding", () => {
  it("records the cluster id in removedClusterIds", () => {
    const op = assembleEditOp({ op: "RemoveBuilding" }, BUILDING_CLICK);
    const overlay = applyOpToOverlay(emptyOverlay(), op, new Map(), METRES_PER_STOREY, 0);
    expect(overlay.removedClusterIds.has("c0")).toBe(true);
  });
});

// ─── computeEffectiveBuildings ────────────────────────────────────────────────

describe("computeEffectiveBuildings", () => {
  // c0: podium (36 m) + shaft (198 m), repHeight=198. c1: other (25 m).
  const podium = makeBuilding("podium", "c0", 36);
  const shaft = makeBuilding("shaft", "c0", 198);
  const other = makeBuilding("other", "c1", 25);
  const repHeights = new Map([["c0", 198], ["c1", 25]]);

  it("ModifyBuilding scales podium and shaft proportionally", () => {
    // 30 storeys = 90 m; ratio = 90 / 198
    const op = assembleEditOp({ op: "ModifyBuilding", heightStoreys: 30 }, BUILDING_CLICK);
    const overlay = applyOpToOverlay(emptyOverlay(), op, repHeights, METRES_PER_STOREY, 0);
    const { realBuildings } = computeEffectiveBuildings([podium, shaft, other], repHeights, overlay);

    const ratio = 90 / 198;
    const podiumOut = realBuildings.find((b) => b.id === "podium")!;
    const shaftOut = realBuildings.find((b) => b.id === "shaft")!;
    expect(podiumOut.heightValue).toBeCloseTo(36 * ratio, 6);
    expect(shaftOut.heightValue).toBeCloseTo(198 * ratio, 6);
    // c1 is unaffected
    expect(realBuildings.find((b) => b.id === "other")!.heightValue).toBe(25);
  });

  it("RemoveBuilding excludes all cluster members", () => {
    const op = assembleEditOp({ op: "RemoveBuilding" }, BUILDING_CLICK);
    const overlay = applyOpToOverlay(emptyOverlay(), op, repHeights, METRES_PER_STOREY, 0);
    const { realBuildings } = computeEffectiveBuildings([podium, shaft, other], repHeights, overlay);
    expect(realBuildings.find((b) => b.id === "podium")).toBeUndefined();
    expect(realBuildings.find((b) => b.id === "shaft")).toBeUndefined();
    expect(realBuildings.find((b) => b.id === "other")).toBeDefined();
  });

  it("AddBuilding appears in hypotheticalBuildings, not realBuildings", () => {
    const op = assembleEditOp({ op: "AddBuilding", heightStoreys: 30 }, GROUND_CLICK);
    const overlay = applyOpToOverlay(emptyOverlay(), op, repHeights, METRES_PER_STOREY, 0);
    const { realBuildings, hypotheticalBuildings } = computeEffectiveBuildings(
      [podium, shaft, other],
      repHeights,
      overlay
    );
    expect(hypotheticalBuildings).toHaveLength(1);
    expect(hypotheticalBuildings[0].confidence.kind).toBe("hypothetical");
    expect(realBuildings).toHaveLength(3); // originals unchanged
  });
});

// ─── replayLog (undo) ─────────────────────────────────────────────────────────

describe("replayLog", () => {
  it("replaying an empty log gives an empty overlay", () => {
    const overlay = replayLog([], new Map(), METRES_PER_STOREY);
    expect(overlay.removedClusterIds.size).toBe(0);
    expect(overlay.modifiedClusterHeights.size).toBe(0);
    expect(overlay.addedBuildings).toHaveLength(0);
  });

  it("undo: removing the last op from the log restores prior state", () => {
    const repHeights = new Map([["c0", 198]]);
    const addOp = assembleEditOp({ op: "AddBuilding", heightStoreys: 30 }, GROUND_CLICK);
    const removeOp = assembleEditOp({ op: "RemoveBuilding" }, BUILDING_CLICK);

    const fullLog: EditOp[] = [addOp, removeOp];
    const undoneLog: EditOp[] = [addOp]; // pop removeOp

    const full = replayLog(fullLog, repHeights, METRES_PER_STOREY);
    const undone = replayLog(undoneLog, repHeights, METRES_PER_STOREY);

    // After full log: c0 is removed.
    expect(full.removedClusterIds.has("c0")).toBe(true);
    // After undo: c0 is no longer removed.
    expect(undone.removedClusterIds.has("c0")).toBe(false);
    // The add op is still in undone.
    expect(undone.addedBuildings).toHaveLength(1);
  });
});

// ─── buildDiffLine ────────────────────────────────────────────────────────────

describe("buildDiffLine", () => {
  it("Add with use", () => {
    const op = assembleEditOp(
      { op: "AddBuilding", heightStoreys: 30, use: "residential" },
      GROUND_CLICK
    );
    expect(buildDiffLine(op, 3)).toBe("Add: 30-storey residential, ~90 m");
  });

  it("Add without use", () => {
    const op = assembleEditOp({ op: "AddBuilding", heightStoreys: 10 }, GROUND_CLICK);
    expect(buildDiffLine(op, 3)).toBe("Add: 10-storey, ~30 m");
  });

  it("Modify", () => {
    const op = assembleEditOp({ op: "ModifyBuilding", heightStoreys: 20 }, BUILDING_CLICK);
    expect(buildDiffLine(op, 3)).toBe("Modify: c0 -> 20 storeys (~60 m)");
  });

  it("Remove", () => {
    const op = assembleEditOp({ op: "RemoveBuilding" }, BUILDING_CLICK);
    expect(buildDiffLine(op, 3)).toBe("Remove: cluster c0");
  });
});
