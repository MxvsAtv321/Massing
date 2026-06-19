import { describe, it, expect } from "vitest";
import { parseRoadNetwork } from "../src/network/build";
import type { RawNetworkFile, RawNode, RawWay, RawWayTags, NetworkManifest } from "../src/network/types";

const LON0 = -79.375;
const LAT0 = 43.65;

const MANIFEST: NetworkManifest = {
  source: "test",
  license: "test",
  attribution: "test",
  api: "test",
  query: "test",
  retrievedDate: "2026-01-01",
  bbox: { south: 0, west: 0, north: 0, east: 0 },
  drivableFilter: { include: [], exclude: [], note: "" },
};

// A small square of nodes around the origin (~80 m east, ~111 m north per 0.001 deg).
const NODES: Record<number, RawNode> = {
  1: { id: 1, lon: LON0, lat: LAT0 },
  2: { id: 2, lon: LON0 + 0.001, lat: LAT0 },
  3: { id: 3, lon: LON0 + 0.001, lat: LAT0 + 0.001 },
  4: { id: 4, lon: LON0, lat: LAT0 + 0.001 },
  5: { id: 5, lon: LON0 + 0.002, lat: LAT0 },
};

function tags(p: Partial<RawWayTags> = {}): RawWayTags {
  return { highway: "residential", name: null, oneway: null, lanes: null, maxspeed: null, junction: null, ...p };
}

function way(id: number, nodes: number[], p: Partial<RawWayTags> = {}): RawWay {
  return { id, nodes, tags: tags(p) };
}

function file(nodeIds: number[], ways: RawWay[]): RawNetworkFile {
  return { provenance: MANIFEST, nodes: nodeIds.map((i) => NODES[i]), ways };
}

describe("parseRoadNetwork: two-way square", () => {
  const raw = file(
    [1, 2, 3, 4],
    [way(10, [1, 2]), way(11, [2, 3]), way(12, [3, 4]), way(13, [4, 1])]
  );
  const net = parseRoadNetwork(raw, [LON0, LAT0]);

  it("keeps all nodes and produces two directed edges per two-way segment", () => {
    expect(net.coverage.graphNodes).toBe(4);
    expect(net.coverage.undirectedSegments).toBe(4);
    expect(net.coverage.directedEdges).toBe(8);
    expect(net.coverage.strandedNodes).toBe(0);
    expect(net.coverage.connected).toBe(true);
  });

  it("places node 1 at the ENU origin and node 2 ~80 m east", () => {
    const n1 = net.nodes.find((n) => n.osmNodeId === 1)!;
    const n2 = net.nodes.find((n) => n.osmNodeId === 2)!;
    expect(Math.hypot(n1.enu[0], n1.enu[1])).toBeLessThan(1e-6);
    expect(n2.enu[0]).toBeGreaterThan(78);
    expect(n2.enu[0]).toBeLessThan(83);
    expect(Math.abs(n2.enu[1])).toBeLessThan(1e-6);
  });

  it("gives each node degree 4 (two two-way streets) and an adjacency entry", () => {
    for (const n of net.nodes) {
      expect(n.degree).toBe(4);
      expect(net.adjacency.get(n.id)).toHaveLength(2); // outgoing only
    }
  });

  it("emits the reverse edge with reversed geometry for a two-way segment", () => {
    const fwd = net.edges.find((e) => e.from === "1" && e.to === "2")!;
    const rev = net.edges.find((e) => e.from === "2" && e.to === "1")!;
    expect(fwd).toBeDefined();
    expect(rev).toBeDefined();
    expect(fwd.oneway).toBe(false);
    expect(rev.geometry).toEqual([...fwd.geometry].reverse());
    expect(rev.lengthMetres).toBeCloseTo(fwd.lengthMetres, 9);
  });

  it("reports a positive centerline length not double-counting two-way edges", () => {
    // 2 east segments (~80.5 m) + 2 north segments (~111.3 m) ~= 0.384 km.
    expect(net.coverage.centerlineKm).toBeGreaterThan(0.37);
    expect(net.coverage.centerlineKm).toBeLessThan(0.40);
  });
});

describe("parseRoadNetwork: directed triangle (forward and reverse oneway)", () => {
  const raw = file(
    [1, 2, 3],
    [
      way(10, [1, 2], { oneway: "yes" }), // 1 -> 2
      way(11, [2, 3], { oneway: "yes" }), // 2 -> 3
      way(12, [1, 3], { oneway: "-1" }), // node order 1,3 reversed -> 3 -> 1
    ]
  );
  const net = parseRoadNetwork(raw, [LON0, LAT0]);

  it("forms a single 3-node directed cycle", () => {
    expect(net.coverage.graphNodes).toBe(3);
    expect(net.coverage.directedEdges).toBe(3);
    expect(net.coverage.connected).toBe(true);
  });

  it("directs each edge per its oneway tag and reverses geometry for oneway=-1", () => {
    expect(net.edges.every((e) => e.oneway)).toBe(true);
    const e10 = net.edges.find((e) => e.osmWayId === 10)!;
    const e12 = net.edges.find((e) => e.osmWayId === 12)!;
    expect([e10.from, e10.to]).toEqual(["1", "2"]);
    expect([e12.from, e12.to]).toEqual(["3", "1"]); // reversed from node order [1,3]
    // geometry[0] is node 3's ENU, since the edge runs 3 -> 1.
    const n3 = net.nodes.find((n) => n.osmNodeId === 3)!;
    expect(e12.geometry[0]).toEqual(n3.enu);
  });
});

describe("parseRoadNetwork: pruning a stranded node", () => {
  const raw = file(
    [1, 2, 3, 4, 5],
    [
      way(10, [1, 2]),
      way(11, [2, 3]),
      way(12, [3, 4]),
      way(13, [4, 1]),
      way(14, [2, 5], { oneway: "yes" }), // 2 -> 5 only; node 5 can never return
    ]
  );
  const net = parseRoadNetwork(raw, [LON0, LAT0]);

  it("drops the stranded node and the edge into it, and reports it", () => {
    expect(net.coverage.graphNodesBeforePrune).toBe(5);
    expect(net.coverage.graphNodes).toBe(4);
    expect(net.coverage.strandedNodes).toBe(1);
    expect(net.coverage.connected).toBe(true);
    expect(net.nodes.some((n) => n.osmNodeId === 5)).toBe(false);
    expect(net.edges.some((e) => e.to === "5")).toBe(false);
  });
});
