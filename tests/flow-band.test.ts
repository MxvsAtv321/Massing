import { describe, it, expect } from "vitest";
import { assignWithBand, type ODNodeFlow } from "../src/traffic/assignment";
import { buildAdjacency, type RoutableEdge, type RoutableGraph } from "../src/traffic/routableGraph";

function singleEdgeGraph(defaultedLanes: boolean): RoutableGraph {
  const nodes = ["O", "D"].map((id) => ({ id, enu: [0, 0] as [number, number] }));
  const edges: RoutableEdge[] = [
    {
      id: "OD",
      from: "O",
      to: "D",
      geometry: [[0, 0], [1, 0]],
      lengthMetres: 1000,
      speedLimitKph: 40,
      lanes: 2,
      roadClass: "primary",
      oneway: true,
      defaultedLanes,
    },
  ];
  return { nodes, edges, adjacency: buildAdjacency(nodes, edges) };
}

const OD: ODNodeFlow[] = [{ fromNodeId: "O", toNodeId: "D", tripsPerHour: 1200 }];

describe("assignWithBand", () => {
  it("keeps low <= mid <= high for volume, v/c, and speed", () => {
    const r = assignWithBand(singleEdgeGraph(false), OD);
    const ef = r.perEdge.get("OD")!;
    expect(ef.volumeLow).toBeLessThanOrEqual(ef.volumeMid + 1e-9);
    expect(ef.volumeMid).toBeLessThanOrEqual(ef.volumeHigh + 1e-9);
    expect(ef.vcLow).toBeLessThanOrEqual(ef.vcMid + 1e-9);
    expect(ef.vcMid).toBeLessThanOrEqual(ef.vcHigh + 1e-9);
    expect(ef.speedLowKph).toBeLessThanOrEqual(ef.speedMidKph + 1e-9);
    expect(ef.speedMidKph).toBeLessThanOrEqual(ef.speedHighKph + 1e-9);
  });

  it("is deterministic for a fixed seed", () => {
    const a = assignWithBand(singleEdgeGraph(false), OD).perEdge.get("OD")!;
    const b = assignWithBand(singleEdgeGraph(false), OD).perEdge.get("OD")!;
    expect(b).toEqual(a);
  });

  it("produces a wider band where the lane count was defaulted", () => {
    const tagged = assignWithBand(singleEdgeGraph(false), OD).perEdge.get("OD")!;
    const defaulted = assignWithBand(singleEdgeGraph(true), OD).perEdge.get("OD")!;
    expect(tagged.bandWidthRel).toBeGreaterThan(0);
    expect(defaulted.bandWidthRel).toBeGreaterThan(tagged.bandWidthRel);
  });
});
