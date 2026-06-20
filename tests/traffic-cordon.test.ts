import { describe, it, expect } from "vitest";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { enuToLonLat } from "../src/network/geometry";
import type { RoadNetwork, NetworkNode } from "../src/network/types";

const ORIGIN: [number, number] = [-79.375, 43.65];

function net(nodes: [string, [number, number]][]): RoadNetwork {
  const ns: NetworkNode[] = nodes.map(([id, enu]) => ({
    id,
    osmNodeId: Number(id),
    enu,
    degree: 0,
  }));
  return {
    originLatLon: ORIGIN,
    crsNote: "",
    nodes: ns,
    edges: [],
    adjacency: new Map(),
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
      graphNodesBeforePrune: ns.length,
      directedEdgesBeforePrune: 0,
      strandedNodes: 0,
      strandedComponents: 0,
      graphNodes: ns.length,
      directedEdges: 0,
      centerlineKm: 0,
      connected: true,
    },
  };
}

// Build a gateway lon/lat that maps to a target ENU point via the inverse transform.
function gatewayAt(enu: [number, number]): [number, number] {
  return enuToLonLat(enu[0], enu[1], ORIGIN[0], ORIGIN[1]);
}

describe("resolveCordon", () => {
  const network = net([
    ["1", [0, 0]],
    ["2", [500, 0]],
    ["3", [0, 500]],
  ]);

  it("snaps a gateway to the nearest network node and records the connector", () => {
    const file: CordonFile = {
      maxResolveMetres: 120,
      gateways: [{ id: "gw-a", label: "A", side: "E", lonlat: gatewayAt([12, 0]) }],
    };
    const { places, unresolved } = resolveCordon(network, file);
    expect(unresolved).toHaveLength(0);
    expect(places).toHaveLength(1);
    expect(places[0].connectorNodeId).toBe("1");
    expect(places[0].centroidEnu).toEqual([0, 0]);
  });

  it("flags a gateway beyond maxResolveMetres as unresolved", () => {
    const file: CordonFile = {
      maxResolveMetres: 120,
      gateways: [{ id: "gw-far", label: "Far", side: "S", lonlat: gatewayAt([5000, 5000]) }],
    };
    const { places, unresolved } = resolveCordon(network, file);
    expect(places).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].dist).toBeGreaterThan(120);
  });

  it("resolves two distinct gateways to two distinct connector nodes", () => {
    const file: CordonFile = {
      maxResolveMetres: 120,
      gateways: [
        { id: "gw-a", label: "A", side: "W", lonlat: gatewayAt([5, 0]) },
        { id: "gw-b", label: "B", side: "E", lonlat: gatewayAt([495, 0]) },
      ],
    };
    const { places } = resolveCordon(network, file);
    expect(places.map((p) => p.connectorNodeId)).toEqual(["1", "2"]);
  });
});
