import { describe, it, expect } from "vitest";
import { geometryAcceptance, networkAcceptance, solarAcceptance } from "../src/model/acceptance";
import { lonLatToEnu } from "../src/coords/enu";
import type { CityModel } from "../src/model/types";
import type { RoadNetwork, NetworkEdge } from "../src/network/types";

const ORIGIN: [number, number] = [-79.37, 43.65];

// A closed square ring with positive area.
function square(cx: number, cy: number, s = 10): number[][][] {
  return [[[cx, cy], [cx + s, cy], [cx + s, cy + s], [cx, cy + s], [cx, cy]]];
}

function modelOf(footprints: number[][][][], origin = ORIGIN): CityModel {
  return {
    originLatLon: origin,
    buildings: footprints.map((f, i) => ({ id: String(i), footprint: f })),
  } as unknown as CityModel;
}

// An ENU edge built from two lon/lats; lengthMetres scaled by `scale` (1 = correct framing, 1.38 mimics
// Web Mercator metres without the cos(lat0) factor).
function enuEdge(lonA: number, latA: number, lonB: number, latB: number, scale = 1): NetworkEdge {
  const a = lonLatToEnu(lonA, latA, ORIGIN[0], ORIGIN[1]);
  const b = lonLatToEnu(lonB, latB, ORIGIN[0], ORIGIN[1]);
  const planar = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { geometry: [a, b], lengthMetres: planar * scale } as unknown as NetworkEdge;
}

function nedge(from: string, to: string, len: number): NetworkEdge {
  return { from, to, lengthMetres: len } as unknown as NetworkEdge;
}

function netOf(edges: NetworkEdge[], nodeIds: string[], graphNodes: number, beforePrune: number): RoadNetwork {
  const adjacency = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const from = (e as unknown as { from: string }).from;
    const list = adjacency.get(from) ?? [];
    list.push(i);
    adjacency.set(from, list);
  });
  return {
    originLatLon: ORIGIN,
    nodes: nodeIds.map((id) => ({ id })),
    edges,
    adjacency,
    coverage: { graphNodes, graphNodesBeforePrune: beforePrune },
  } as unknown as RoadNetwork;
}

describe("geometryAcceptance", () => {
  it("passes good footprints with correctly framed edges", () => {
    const r = geometryAcceptance(modelOf([square(0, 0), square(50, 50)]), {
      edges: [enuEdge(-79.37, 43.65, -79.365, 43.652)],
    } as unknown as RoadNetwork);
    expect(r.ok).toBe(true);
    expect(r.degenerateRings).toBe(0);
    expect(r.worstLengthRelError).toBeLessThan(0.005);
  });

  it("fails when the coordinate framing is wrong (the Web Mercator metres error)", () => {
    const r = geometryAcceptance(modelOf([square(0, 0)]), {
      edges: [enuEdge(-79.37, 43.65, -79.36, 43.655, 1.38)],
    } as unknown as RoadNetwork);
    expect(r.ok).toBe(false);
    expect(r.worstLengthRelError).toBeGreaterThan(0.1);
  });

  it("fails on a degenerate footprint ring", () => {
    const r = geometryAcceptance(modelOf([[[[0, 0], [1, 0], [0, 0]]]]), {
      edges: [enuEdge(-79.37, 43.65, -79.365, 43.652)],
    } as unknown as RoadNetwork);
    expect(r.ok).toBe(false);
    expect(r.degenerateRings).toBe(1);
  });
});

describe("networkAcceptance", () => {
  it("passes a single SCC at full dominance", () => {
    const r = networkAcceptance(netOf([nedge("A", "B", 100), nedge("B", "A", 100)], ["A", "B"], 2, 2));
    expect(r.ok).toBe(true);
    expect(r.components).toBe(1);
    expect(r.coverage).toBe("full");
  });

  it("fails a disconnected graph", () => {
    const r = networkAcceptance(netOf([nedge("A", "B", 100)], ["A", "B"], 2, 2));
    expect(r.ok).toBe(false);
    expect(r.components).toBe(2);
  });

  it("fails on a zero-length edge", () => {
    const r = networkAcceptance(netOf([nedge("A", "B", 100), nedge("B", "A", 0)], ["A", "B"], 2, 2));
    expect(r.ok).toBe(false);
    expect(r.zeroLengthEdges).toBe(1);
  });

  it("labels partial coverage above the floor, fails below it", () => {
    const cyc = [nedge("A", "B", 100), nedge("B", "A", 100)];
    const partial = networkAcceptance(netOf(cyc, ["A", "B"], 2, 3)); // dominance 0.67
    expect(partial.coverage).toBe("partial");
    expect(partial.ok).toBe(true);
    const broken = networkAcceptance(netOf(cyc, ["A", "B"], 2, 5)); // dominance 0.4
    expect(broken.ok).toBe(false);
  });
});

describe("solarAcceptance", () => {
  it("confirms the equinox identity 90 - |lat| at several latitudes", () => {
    expect(solarAcceptance([-79.37, 43.65]).ok).toBe(true); // Toronto
    expect(solarAcceptance([0, 0]).ok).toBe(true); // equator
    expect(solarAcceptance([-0.13, 51.5]).ok).toBe(true); // London
    expect(solarAcceptance([-99.13, 19.43]).ok).toBe(true); // Mexico City
  });

  it("rejects an impossible latitude", () => {
    expect(solarAcceptance([0, 120]).ok).toBe(false);
  });
});
