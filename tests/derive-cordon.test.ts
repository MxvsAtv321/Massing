import { describe, it, expect } from "vitest";
import { deriveCordon } from "../src/traffic/deriveCordon";
import { exampleScenario, summariseConservation, type CordonSide } from "../src/traffic/demand";
import type { RoadNetwork } from "../src/network/types";

// A grid of nodes spanning a square; the perimeter nodes are the boundary crossings.
function gridNetwork(span = 200, step = 20): RoadNetwork {
  const nodes: { id: string; enu: [number, number] }[] = [];
  let k = 0;
  for (let e = 0; e <= span; e += step) {
    for (let n = 0; n <= span; n += step) {
      nodes.push({ id: `n${k++}`, enu: [e, n] });
    }
  }
  return { nodes } as unknown as RoadNetwork;
}

function sideCounts(places: { side: CordonSide }[]): Record<CordonSide, number> {
  const c: Record<CordonSide, number> = { N: 0, E: 0, S: 0, W: 0 };
  for (const p of places) c[p.side]++;
  return c;
}

describe("deriveCordon", () => {
  it("derives gateways on all four sides of the catchment", () => {
    const c = sideCounts(deriveCordon(gridNetwork(), { marginM: 10, maxPerSide: 4 }));
    expect(c.E).toBeGreaterThan(0);
    expect(c.W).toBeGreaterThan(0);
    expect(c.N).toBeGreaterThan(0);
    expect(c.S).toBeGreaterThan(0);
  });

  it("connector nodes are distinct", () => {
    const places = deriveCordon(gridNetwork(), { marginM: 10, maxPerSide: 4 });
    expect(new Set(places.map((p) => p.connectorNodeId)).size).toBe(places.length);
  });

  it("the example scenario over the derived cordon is balanced", () => {
    const places = deriveCordon(gridNetwork(), { marginM: 10, maxPerSide: 4 });
    const flows = exampleScenario(places);
    expect(flows.length).toBeGreaterThan(0);
    expect(summariseConservation(places, flows).balanced).toBe(true);
  });

  it("caps the gateways per side", () => {
    const places = deriveCordon(gridNetwork(200, 10), { marginM: 5, maxPerSide: 3 });
    expect(places.filter((p) => p.side === "E").length).toBeLessThanOrEqual(3);
  });
});
