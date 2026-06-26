import { describe, it, expect } from "vitest";
import { GenerativeOpSchema } from "../src/generate/op";
import { Sandbox } from "../src/agent/sandbox";
import { executeTool } from "../src/agent/dispatch";
import type { GenerativeContext } from "../src/generate/types";

const CTX: GenerativeContext = { namedRegions: {}, streets: {}, districtBoundaries: {}, clusterCentroids: {} };
const OPTS = { metresPerStorey: 3 };
const op = (raw: unknown) => GenerativeOpSchema.parse(raw);
const DEFINE = op({ op: "DefineDistrict", district: "d1", region: { kind: "rect", center: [0, 0], halfExtents: [150, 150], rotationRad: 0 }, seed: 1 });
const LAY = op({ op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 100, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true });
const FILL = op({ op: "FillBlocks", district: "d1", program: "residential", target: { unitsPerHa: 600 }, heightEnvelope: { minStoreys: 8, maxStoreys: 8 }, coverage: 0.45 });

function ready() {
  const sb = new Sandbox(CTX, OPTS);
  [DEFINE, LAY, FILL].forEach((o) => executeTool(sb, "apply_op", o));
  return sb;
}

describe("executeTool", () => {
  it("validates and applies a valid op, returning it for streaming", () => {
    const r = executeTool(new Sandbox(CTX, OPTS), "apply_op", DEFINE);
    expect(r.ok).toBe(true);
    expect(r.op).toBeDefined();
  });

  it("rejects a malformed op as a tool error (never bad geometry)", () => {
    const r = executeTool(new Sandbox(CTX, OPTS), "apply_op", { op: "Nonsense" });
    expect(r.ok).toBe(false);
  });

  it("returns the unit score", () => {
    const r = executeTool(ready(), "score_units", { districtId: "d1" });
    expect(r.ok).toBe(true);
  });

  it("requires a districtId for scores", () => {
    expect(executeTool(ready(), "score_units", {}).ok).toBe(false);
  });

  it("errors on an unknown tool", () => {
    expect(executeTool(new Sandbox(CTX, OPTS), "frobnicate", {}).ok).toBe(false);
  });
});
