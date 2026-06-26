import { describe, it, expect } from "vitest";
import { fillBlockDirective } from "../src/generate/directive";

const REGION = {
  kind: "rect" as const,
  center: [0, 0] as [number, number],
  halfExtents: [40, 40] as [number, number],
  rotationRad: 0,
};

describe("fillBlockDirective", () => {
  it("emits a valid define, lay, fill triple", () => {
    const ops = fillBlockDirective({ district: "g1", region: REGION, seed: 1, storeys: 20 });
    expect(ops.map((o) => o.op)).toEqual(["DefineDistrict", "LayStreets", "FillBlocks"]);
  });

  it("fills at a uniform height (min equals max equals storeys)", () => {
    const ops = fillBlockDirective({ district: "g1", region: REGION, seed: 1, storeys: 20 });
    const fill = ops.find((o) => o.op === "FillBlocks");
    if (fill?.op !== "FillBlocks") throw new Error("missing fill");
    expect(fill.heightEnvelope.minStoreys).toBe(20);
    expect(fill.heightEnvelope.maxStoreys).toBe(20);
    expect(fill.program).toBe("residential");
  });

  it("threads the district id through every op", () => {
    const ops = fillBlockDirective({ district: "blockA", region: REGION, seed: 7, storeys: 12 });
    for (const o of ops) expect(o.district).toBe("blockA");
  });
});
