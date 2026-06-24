import { describe, it, expect } from "vitest";
import {
  clusterDeltaTrips,
  buildingDemandFlows,
  combineDemand,
  TRIPS_PER_STOREY,
} from "../src/traffic/reactiveDemand";
import { solveFlowLite, type ODNodeFlow } from "../src/traffic/assignment";
import { buildAdjacency, type RoutableGraph } from "../src/traffic/routableGraph";

describe("clusterDeltaTrips", () => {
  it("is zero at ratio 1 (no edit)", () => {
    expect(clusterDeltaTrips(60, 1, 3)).toBe(0);
  });

  it("scales with added storeys", () => {
    // 60 m at 3 m/storey = 20 storeys; doubling adds 20 storeys.
    expect(clusterDeltaTrips(60, 2, 3)).toBeCloseTo(20 * TRIPS_PER_STOREY, 6);
  });

  it("clamps lowering to zero (nothing to remove)", () => {
    expect(clusterDeltaTrips(60, 0.5, 3)).toBe(0);
  });

  it("guards a bad metres-per-storey", () => {
    expect(clusterDeltaTrips(60, 2, 0)).toBe(0);
  });
});

describe("buildingDemandFlows", () => {
  it("emits a balanced in/out pair per gateway", () => {
    const flows = buildingDemandFlows("b", 1000, ["g1", "g2"]);
    expect(flows).toHaveLength(4);
    const per = 1000 / 2;
    expect(flows).toContainEqual({ fromNodeId: "b", toNodeId: "g1", tripsPerHour: per });
    expect(flows).toContainEqual({ fromNodeId: "g1", toNodeId: "b", tripsPerHour: per });
  });

  it("skips a gateway that is the building node itself", () => {
    const flows = buildingDemandFlows("g1", 1000, ["g1", "g2"]);
    expect(flows.every((f) => f.fromNodeId !== f.toNodeId)).toBe(true);
    expect(flows).toHaveLength(2); // only the g2 pair
  });

  it("emits nothing with no delta or no gateways", () => {
    expect(buildingDemandFlows("b", 0, ["g1"])).toEqual([]);
    expect(buildingDemandFlows("b", 1000, [])).toEqual([]);
  });
});

describe("combineDemand", () => {
  const base: ODNodeFlow[] = [{ fromNodeId: "x", toNodeId: "y", tripsPerHour: 10 }];
  it("returns the base unchanged when there are no building flows", () => {
    expect(combineDemand(base, [])).toBe(base);
  });
  it("concatenates building flows onto the base", () => {
    const extra: ODNodeFlow[] = [{ fromNodeId: "b", toNodeId: "g", tripsPerHour: 5 }];
    expect(combineDemand(base, extra)).toEqual([...base, ...extra]);
  });
});

describe("solveFlowLite", () => {
  // A->B->C corridor; both two-lane secondary (per-direction cap 800).
  const nodes = [
    { id: "A", enu: [0, 0] as [number, number] },
    { id: "B", enu: [100, 0] as [number, number] },
    { id: "C", enu: [200, 0] as [number, number] },
  ];
  const edges = [
    { id: "AB", from: "A", to: "B", geometry: [[0, 0], [100, 0]] as [number, number][], lengthMetres: 100, lanes: 2, speedLimitKph: 50, roadClass: "secondary" as const, oneway: false, defaultedLanes: false },
    { id: "BC", from: "B", to: "C", geometry: [[100, 0], [200, 0]] as [number, number][], lengthMetres: 100, lanes: 2, speedLimitKph: 50, roadClass: "secondary" as const, oneway: false, defaultedLanes: false },
  ];
  const graph: RoutableGraph = { nodes, edges, adjacency: buildAdjacency(nodes, edges) };

  it("is free-flowing with no demand", () => {
    const flow = solveFlowLite(graph, []);
    expect(flow.get("AB")!.vc).toBe(0);
    expect(flow.get("AB")!.speedKph).toBeCloseTo(50, 3);
  });

  it("loads the path and slows it as demand rises", () => {
    const light = solveFlowLite(graph, [{ fromNodeId: "A", toNodeId: "C", tripsPerHour: 800 }]);
    const heavy = solveFlowLite(graph, [{ fromNodeId: "A", toNodeId: "C", tripsPerHour: 4000 }]);
    expect(light.get("AB")!.vc).toBeGreaterThan(0);
    expect(heavy.get("AB")!.vc).toBeGreaterThan(light.get("AB")!.vc);
    expect(heavy.get("AB")!.speedKph).toBeLessThan(light.get("AB")!.speedKph);
    expect(light.get("AB")!.speedKph).toBeLessThan(50);
  });
});
