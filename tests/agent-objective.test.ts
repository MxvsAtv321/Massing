import { describe, it, expect } from "vitest";
import { evaluateVector, satisfaction, isBetter, type Objective } from "../src/agent/objective";

const VECTOR: Objective[] = [
  { kind: "population", target: 40000, tolFrac: 0.05 },
  { kind: "parkSunHours", floor: 4 },
  { kind: "parkReachMinutes", ceiling: 5 },
];

describe("evaluateVector", () => {
  it("meets all when every value is in range, no shortfalls", () => {
    const ev = evaluateVector({ population: 40000, parkSunHours: 5, parkReachMinutes: 4 }, VECTOR);
    expect(ev.allMet).toBe(true);
    expect(ev.results.every((r) => r.shortfall === 0)).toBe(true);
  });

  it("reports population under target as a traded shortfall", () => {
    const ev = evaluateVector({ population: 32000, parkSunHours: 5, parkReachMinutes: 4 }, VECTOR);
    expect(ev.allMet).toBe(false);
    const pop = ev.results.find((r) => r.kind === "population")!;
    expect(pop.met).toBe(false);
    expect(pop.shortfall).toBe(8000); // 40000 - 32000, positive = under
    expect(pop.shortfallFrac).toBeCloseTo(0.2, 6);
  });

  it("trades park sun under the floor and park reach over the ceiling", () => {
    const sunShort = evaluateVector({ population: 40000, parkSunHours: 2, parkReachMinutes: 4 }, VECTOR);
    expect(sunShort.results.find((r) => r.kind === "parkSunHours")!.shortfall).toBe(2);
    const reachShort = evaluateVector({ population: 40000, parkSunHours: 5, parkReachMinutes: 8 }, VECTOR);
    expect(reachShort.results.find((r) => r.kind === "parkReachMinutes")!.shortfall).toBe(3);
  });
});

describe("satisfaction / isBetter", () => {
  it("prefers more objectives met, then less total shortfall", () => {
    const allMet = satisfaction(evaluateVector({ population: 40000, parkSunHours: 5, parkReachMinutes: 4 }, VECTOR));
    const traded = satisfaction(evaluateVector({ population: 32000, parkSunHours: 5, parkReachMinutes: 4 }, VECTOR));
    const worse = satisfaction(evaluateVector({ population: 30000, parkSunHours: 5, parkReachMinutes: 4 }, VECTOR));
    expect(isBetter(allMet, traded)).toBe(true); // 3 met beats 2 met
    expect(isBetter(traded, worse)).toBe(true); // same met count, closer population
    expect(isBetter(worse, traded)).toBe(false);
  });
});
