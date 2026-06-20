import { describe, it, expect } from "vitest";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { exampleScenario, summariseConservation, validateFlow } from "../src/traffic/demand";
import { enuToLonLat } from "../src/network/geometry";
import type { RoadNetwork, NetworkNode } from "../src/network/types";

const ORIGIN: [number, number] = [-79.375, 43.65];

function net(nodes: [string, [number, number]][]): RoadNetwork {
  const ns: NetworkNode[] = nodes.map(([id, enu]) => ({ id, osmNodeId: Number(id), enu, degree: 0 }));
  return {
    originLatLon: ORIGIN,
    crsNote: "",
    nodes: ns,
    edges: [],
    adjacency: new Map(),
    provenance: {
      source: "t", license: "t", attribution: "t", api: "t", query: "t", retrievedDate: "t",
      bbox: { south: 0, west: 0, north: 0, east: 0 },
      drivableFilter: { include: [], exclude: [], note: "" },
    },
    coverage: {
      rawNodes: 0, rawWays: 0, undirectedSegments: 0, excludedZeroLength: 0, excludedDanglingWays: 0,
      graphNodesBeforePrune: ns.length, directedEdgesBeforePrune: 0, strandedNodes: 0, strandedComponents: 0,
      graphNodes: ns.length, directedEdges: 0, centerlineKm: 0, connected: true,
    },
  };
}

const gw = (enu: [number, number]): [number, number] => enuToLonLat(enu[0], enu[1], ORIGIN[0], ORIGIN[1]);

const NETWORK = net([
  ["e", [500, 0]],
  ["w", [-500, 0]],
  ["n", [0, 500]],
  ["s", [0, -500]],
]);

describe("demand gate conditions", () => {
  it("passes: gateways resolve, span E and W, distinct connectors, example valid and balanced", () => {
    const file: CordonFile = {
      maxResolveMetres: 120,
      gateways: [
        { id: "ge", label: "E", side: "E", lonlat: gw([505, 0]) },
        { id: "gw", label: "W", side: "W", lonlat: gw([-505, 0]) },
        { id: "gn", label: "N", side: "N", lonlat: gw([0, 505]) },
        { id: "gs", label: "S", side: "S", lonlat: gw([0, -505]) },
      ],
    };
    const { places, unresolved } = resolveCordon(NETWORK, file);
    expect(unresolved).toHaveLength(0);

    const connectors = new Set(places.map((p) => p.connectorNodeId));
    expect(connectors.size).toBe(places.length); // distinct

    const sides = new Set(places.map((p) => p.side));
    expect(sides.has("E") && sides.has("W")).toBe(true); // through directions

    const ids = new Set(places.map((p) => p.id));
    const flows = exampleScenario(places);
    expect(flows.length).toBeGreaterThan(0);
    for (const f of flows) expect(validateFlow(f, ids)).toEqual({ ok: true });
    expect(summariseConservation(places, flows).balanced).toBe(true);
  });

  it("fails resolution: an off-network gateway is unresolved", () => {
    const file: CordonFile = {
      maxResolveMetres: 120,
      gateways: [{ id: "bad", label: "bad", side: "E", lonlat: gw([9000, 9000]) }],
    };
    expect(resolveCordon(NETWORK, file).unresolved.length).toBeGreaterThan(0);
  });

  it("detects a duplicate connector: two gateways snapping to the same node", () => {
    const file: CordonFile = {
      maxResolveMetres: 120,
      gateways: [
        { id: "a", label: "a", side: "E", lonlat: gw([502, 1]) },
        { id: "b", label: "b", side: "E", lonlat: gw([498, -1]) },
      ],
    };
    const { places } = resolveCordon(NETWORK, file);
    const connectors = places.map((p) => p.connectorNodeId);
    expect(new Set(connectors).size).toBeLessThan(connectors.length); // collision the gate flags
  });
});
