import { describe, it, expect } from "vitest";
import { dijkstra } from "../src/network/shortestPath";
import { reprojectPolyline, polylineLengthEnu, haversineLengthLonLat, enuToLonLat } from "../src/network/geometry";
import type { RoadNetwork, NetworkNode, NetworkEdge } from "../src/network/types";

// Build a weighted directed RoadNetwork from [from, to, lengthMetres] triples.
function net(dir: [string, string, number][]): RoadNetwork {
  const ids = new Set<string>();
  for (const [a, b] of dir) {
    ids.add(a);
    ids.add(b);
  }
  const nodes: NetworkNode[] = [...ids].map((id) => ({
    id,
    osmNodeId: Number(id),
    enu: [0, 0],
    degree: 0,
  }));
  const edges: NetworkEdge[] = dir.map(([from, to, len], i) => ({
    id: `e${i}`,
    from,
    to,
    geometry: [],
    lengthMetres: len,
    lanes: 1,
    speedLimitKph: 40,
    roadClass: "residential",
    oneway: true,
    osmWayId: i,
    provenance: {
      source: "t",
      date: "t",
      confidence: { kind: "estimated", sigma_m: 1 },
      defaulted: { lanes: false, speed: false },
    },
  }));
  const adjacency = new Map<string, number[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  edges.forEach((e, i) => adjacency.get(e.from)!.push(i));
  return {
    originLatLon: [0, 0],
    crsNote: "",
    nodes,
    edges,
    adjacency,
    provenance: {
      source: "t",
      license: "t",
      attribution: "t",
      api: "t",
      query: "t",
      retrievedDate: "t",
      bbox: { south: 0, west: 0, north: 0, east: 0 },
      drivableFilter: { include: [], exclude: [], note: "" },
    },
    coverage: {
      rawNodes: 0,
      rawWays: 0,
      undirectedSegments: 0,
      excludedZeroLength: 0,
      excludedDanglingWays: 0,
      graphNodesBeforePrune: nodes.length,
      directedEdgesBeforePrune: edges.length,
      strandedNodes: 0,
      strandedComponents: 0,
      graphNodes: nodes.length,
      directedEdges: edges.length,
      centerlineKm: 0,
      connected: true,
    },
  };
}

describe("dijkstra (known-route gate primitive)", () => {
  it("finds the shortest path and reconstructs it", () => {
    const g = net([
      ["1", "2", 10],
      ["1", "3", 5],
      ["3", "4", 3],
      ["2", "4", 10],
    ]);
    const r = dijkstra(g, "1", "4");
    expect(r).not.toBeNull();
    expect(r!.distance).toBe(8); // 1 -> 3 -> 4
    expect(r!.path).toEqual(["1", "3", "4"]);
  });

  it("returns a distance within a route tolerance of the ground truth", () => {
    const g = net([["1", "2", 210], ["2", "3", 117]]);
    const r = dijkstra(g, "1", "3")!;
    const groundTruth = 327;
    expect(Math.abs(r.distance - groundTruth) / groundTruth).toBeLessThan(0.15);
  });

  it("returns null when the target is unreachable (oneway, no return)", () => {
    const g = net([["1", "2", 10]]);
    expect(dijkstra(g, "2", "1")).toBeNull();
  });
});

describe("edge length gate primitive", () => {
  it("ENU length matches the independent geodesic length within 0.5%", () => {
    const lon0 = -79.375;
    const lat0 = 43.65;
    const lonlat: [number, number][] = [
      [lon0, lat0],
      [lon0 + 0.0015, lat0 + 0.0008],
    ];
    const enu = reprojectPolyline(lonlat, lon0, lat0);
    const enuLen = polylineLengthEnu(enu);
    // Recover lon/lat from ENU (what the gate does) and compare geodesically.
    const geo = haversineLengthLonLat(enu.map(([x, y]) => enuToLonLat(x, y, lon0, lat0)));
    expect(Math.abs(enuLen - geo) / geo).toBeLessThan(0.005);
  });
});
