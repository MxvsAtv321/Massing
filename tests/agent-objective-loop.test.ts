import { describe, it, expect } from "vitest";
import { GenerativeOpSchema } from "../src/generate/op";
import { Sandbox } from "../src/agent/sandbox";
import { runObjectiveLoop } from "../src/agent/objectiveLoop";
import { ScriptedAgent } from "../src/agent/scriptedAgent";
import type { AgentTurn, StreamEvent } from "../src/agent/types";
import type { Objective, ObjectiveValues } from "../src/agent/objective";
import type { GenerativeContext } from "../src/generate/types";

const CTX: GenerativeContext = { namedRegions: {}, streets: {}, districtBoundaries: {}, clusterCentroids: {} };
const OPTS = { metresPerStorey: 3 };
const op = (raw: unknown) => GenerativeOpSchema.parse(raw);
const DEFINE = op({ op: "DefineDistrict", district: "d1", region: { kind: "rect", center: [0, 0], halfExtents: [150, 150], rotationRad: 0 }, seed: 1 });
const LAY = op({ op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 100, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true });
const FILL = op({ op: "FillBlocks", district: "d1", program: "residential", target: { unitsPerHa: 600 }, heightEnvelope: { minStoreys: 8, maxStoreys: 8 }, coverage: 0.45 });
const tc = (name: string, input: unknown) => ({ id: name, name, input });

const VECTOR: Objective[] = [
  { kind: "population", target: 40000, tolFrac: 0.05 },
  { kind: "parkSunHours", floor: 4 },
  { kind: "parkReachMinutes", ceiling: 5 },
];

// A fake readValues that returns a scripted value per apply_op, so the loop's convergence logic is
// tested without real scoring (the route injects the real reader).
function fakeReader(seq: ObjectiveValues[]) {
  let i = 0;
  return () => seq[Math.min(i++, seq.length - 1)];
}

describe("runObjectiveLoop", () => {
  it("converges decisively when all objectives are met", async () => {
    const agent = new ScriptedAgent([
      { text: "build", toolCalls: [tc("apply_op", DEFINE), tc("apply_op", LAY), tc("apply_op", FILL), tc("apply_op", FILL)] },
      { text: "done", toolCalls: [tc("finish", {})] },
    ]);
    const sb = new Sandbox(CTX, OPTS);
    const reader = fakeReader([
      { population: 0, parkSunHours: 0, parkReachMinutes: 99 },
      { population: 0, parkSunHours: 0, parkReachMinutes: 99 },
      { population: 40000, parkSunHours: 5, parkReachMinutes: 4 }, // all met after the fill
    ]);
    const events: StreamEvent[] = [];
    const result = await runObjectiveLoop(agent, sb, VECTOR, "d1", 20, 4, (e) => events.push(e), reader);

    expect(result.converged).toBe(true);
    expect(result.reason).toBe("all objectives met");
    expect(sb.ops().length).toBe(3); // stopped at the fill; the 4th op never applied
    const done = events.find((e) => e.type === "done");
    expect(done?.type === "done" && done.evaluation?.allMet).toBe(true);
  });

  it("lets the agent finish and present when objectives are genuinely traded", async () => {
    const agent = new ScriptedAgent([
      { text: "build", toolCalls: [tc("apply_op", DEFINE), tc("apply_op", LAY), tc("apply_op", FILL)] },
      { text: "40k would put the park under the sun floor, holding at 32k to keep it sunlit", toolCalls: [tc("finish", {})] },
    ]);
    const sb = new Sandbox(CTX, OPTS);
    const reader = fakeReader([
      { population: 0, parkSunHours: 0, parkReachMinutes: 99 },
      { population: 0, parkSunHours: 0, parkReachMinutes: 99 },
      { population: 32000, parkSunHours: 5, parkReachMinutes: 4 }, // sun and reach met, population traded
    ]);
    const result = await runObjectiveLoop(agent, sb, VECTOR, "d1", 20, 5, () => {}, reader);

    expect(result.reason).toBe("agent finished");
    expect(result.converged).toBe(false);
    expect(result.evaluation?.results.find((r) => r.kind === "population")?.met).toBe(false);
    expect(result.evaluation?.results.find((r) => r.kind === "parkSunHours")?.met).toBe(true);
  });

  it("backstops on a stall when the agent keeps building without improving", async () => {
    const turns: AgentTurn[] = Array.from({ length: 20 }, () => ({ text: null, toolCalls: [tc("apply_op", FILL)] }));
    const agent = new ScriptedAgent([{ text: null, toolCalls: [tc("apply_op", DEFINE), tc("apply_op", LAY)] }, ...turns]);
    const sb = new Sandbox(CTX, OPTS);
    const reader = fakeReader([{ population: 20000, parkSunHours: 5, parkReachMinutes: 4 }]); // never improves
    const result = await runObjectiveLoop(agent, sb, VECTOR, "d1", 30, 2, () => {}, reader);
    expect(result.reason).toBe("best balance (objectives traded)");
  });
});
