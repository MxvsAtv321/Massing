import { describe, it, expect } from "vitest";
import {
  freeFlowTimeSec,
  directedLanes,
  edgeCapacity,
  bprTime,
  DEFAULT_ASSIGN_PARAMS,
} from "../src/traffic/assignment";
import type { RoutableEdge } from "../src/traffic/routableGraph";
import type { RoadClass } from "../src/network/types";

function edge(p: Partial<RoutableEdge> & { roadClass: RoadClass }): RoutableEdge {
  return {
    id: "e",
    from: "a",
    to: "b",
    geometry: [[0, 0], [1, 0]],
    lengthMetres: 1000,
    lanes: 2,
    speedLimitKph: 36,
    oneway: true,
    defaultedLanes: false,
    ...p,
  };
}

describe("freeFlowTimeSec", () => {
  it("is length over speed (1000 m at 36 km/h = 100 s)", () => {
    expect(freeFlowTimeSec(edge({ roadClass: "residential" }))).toBeCloseTo(100, 6);
  });
  it("floors absurdly low speeds", () => {
    const t = freeFlowTimeSec(edge({ roadClass: "residential", speedLimitKph: 0 }));
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(0);
  });
});

describe("directedLanes", () => {
  it("uses all lanes for a oneway and splits a two-way", () => {
    expect(directedLanes(edge({ roadClass: "primary", oneway: true, lanes: 3 }))).toBe(3);
    expect(directedLanes(edge({ roadClass: "primary", oneway: false, lanes: 4 }))).toBe(2);
    expect(directedLanes(edge({ roadClass: "residential", oneway: false, lanes: 1 }))).toBe(1);
  });
});

describe("edgeCapacity", () => {
  it("is directed lanes times the per-lane class capacity", () => {
    const cap = edgeCapacity(edge({ roadClass: "primary", oneway: true, lanes: 2 }), DEFAULT_ASSIGN_PARAMS);
    expect(cap).toBe(2 * DEFAULT_ASSIGN_PARAMS.perLaneCap.primary);
  });
});

describe("bprTime", () => {
  const { bprAlpha, bprBeta } = DEFAULT_ASSIGN_PARAMS;
  it("equals free-flow time at zero volume", () => {
    expect(bprTime(100, 0, 1000, bprAlpha, bprBeta)).toBeCloseTo(100, 6);
  });
  it("equals t0*(1+alpha) at volume == capacity", () => {
    expect(bprTime(100, 1000, 1000, bprAlpha, bprBeta)).toBeCloseTo(100 * (1 + bprAlpha), 6);
  });
  it("is monotonically increasing in volume", () => {
    const a = bprTime(100, 500, 1000, bprAlpha, bprBeta);
    const b = bprTime(100, 1500, 1000, bprAlpha, bprBeta);
    expect(b).toBeGreaterThan(a);
  });
});
