import { describe, it, expect } from "vitest";
import { GenerativeOpSchema } from "../src/generate/op";
import { Sandbox } from "../src/agent/sandbox";
import { runLoop } from "../src/agent/loop";
import { ScriptedAgent } from "../src/agent/scriptedAgent";
import type { AgentTurn, StreamEvent } from "../src/agent/types";
import type { GenerativeContext } from "../src/generate/types";

const CTX: GenerativeContext = { namedRegions: {}, streets: {}, districtBoundaries: {}, clusterCentroids: {} };
const OPTS = { metresPerStorey: 3 };
const op = (raw: unknown) => GenerativeOpSchema.parse(raw);
const DEFINE = op({ op: "DefineDistrict", district: "d1", region: { kind: "rect", center: [0, 0], halfExtents: [150, 150], rotationRad: 0 }, seed: 1 });
const LAY = op({ op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 100, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true });
const FILL = op({ op: "FillBlocks", district: "d1", program: "residential", target: { unitsPerHa: 600 }, heightEnvelope: { minStoreys: 8, maxStoreys: 8 }, coverage: 0.45 });

const tc = (name: string, input: unknown) => ({ id: name, name, input });

describe("runLoop", () => {
  it("streams accepted ops, stops the moment it is within tolerance, and reports the signature", async () => {
    const probe = new Sandbox(CTX, OPTS);
    [DEFINE, LAY, FILL].forEach((o) => probe.applyOp(o));
    const target = probe.totalPopulation();

    // The agent emits a 4th op after the fill; the loop must stop at the fill (within tolerance) and
    // never apply the 4th, so the convergence reads decisive.
    const agent = new ScriptedAgent([
      { text: "building", toolCalls: [tc("apply_op", DEFINE), tc("apply_op", LAY), tc("apply_op", FILL), tc("apply_op", LAY)] },
      { text: "more", toolCalls: [tc("finish", {})] },
    ]);
    const sb = new Sandbox(CTX, OPTS);
    const events: StreamEvent[] = [];
    const result = await runLoop(agent, sb, { population: target, tolFrac: 0.05 }, 20, (e) => events.push(e));

    expect(result.converged).toBe(true);
    expect(result.reason).toBe("within tolerance");
    expect(sb.ops().length).toBe(3); // stopped at the fill; the 4th op was never applied
    expect(events.filter((e) => e.type === "op")).toHaveLength(3);
    const done = events.find((e) => e.type === "done");
    expect(done?.type === "done" && done.signature).toBe(probe.signatureAll());
  });

  it("stops at the budget when it never converges", async () => {
    const turns: AgentTurn[] = Array.from({ length: 50 }, () => ({
      text: null,
      toolCalls: [tc("score_units", { districtId: "d1" })],
    }));
    const sb = new Sandbox(CTX, OPTS);
    [DEFINE, LAY, FILL].forEach((o) => sb.applyOp(o));
    const result = await runLoop(new ScriptedAgent(turns), sb, { population: 1e9, tolFrac: 0.01 }, 5, () => {});
    expect(result.reason).toBe("budget");
    expect(result.iterations).toBe(5);
  });

  it("finishes cleanly when the agent calls finish", async () => {
    const agent = new ScriptedAgent([
      { text: null, toolCalls: [tc("apply_op", DEFINE), tc("apply_op", LAY), tc("apply_op", FILL)] },
      { text: null, toolCalls: [tc("finish", {})] },
    ]);
    const sb = new Sandbox(CTX, OPTS);
    const result = await runLoop(agent, sb, { population: 1e9, tolFrac: 0.01 }, 20, () => {});
    expect(result.reason).toBe("agent finished");
    expect(result.signature.length).toBeGreaterThan(0);
  });
});
