import { describe, it, expect } from "vitest";
import { buildClusters } from "../src/model/grouping";
import type { Building } from "../src/model/types";

// Build a minimal Building fixture with ENU footprint.
function makeBuilding(
  id: string,
  heightM: number,
  rings: number[][][]
): Building {
  return {
    id,
    footprint: rings,
    height: {
      value: heightM,
      source: "test",
      date: "2025",
      confidence: { kind: "estimated", sigma_m: 5 },
    },
    baseElevation: {
      value: 0,
      source: "test",
      date: "2025",
      confidence: { kind: "measured", sigma_m: 0 },
    },
    origin: "toronto-open-data",
    clusterId: "",
    isTallestInCluster: false,
    heightSrc: null,
  };
}

// A large square footprint (podium): 50 x 50 m centred near origin.
const PODIUM_RING: number[][] = [
  [0, 0], [50, 0], [50, 50], [0, 50], [0, 0],
];

// A smaller footprint (shaft) that overlaps the podium: 10 x 10 m inset.
const SHAFT_RING: number[][] = [
  [20, 20], [30, 20], [30, 30], [20, 30], [20, 20],
];

// A separate building at a clearly different location.
const SEPARATE_RING: number[][] = [
  [200, 200], [220, 200], [220, 220], [200, 220], [200, 200],
];

describe("buildClusters", () => {
  it("merges overlapping podium and shaft into one cluster", () => {
    const podium = makeBuilding("podium", 36, [PODIUM_RING]);
    const shaft = makeBuilding("shaft", 198, [SHAFT_RING]);
    const { buildings, clusters } = buildClusters([podium, shaft]);

    const clusterIds = new Set(buildings.map((b) => b.clusterId));
    expect(clusterIds.size).toBe(1);

    const [clusterId] = [...clusterIds];
    const entry = clusters[clusterId];
    expect(entry.representativeHeight_m).toBe(198);
    expect(entry.memberIds.sort()).toEqual(["podium", "shaft"]);
    expect(entry.tallestMemberId).toBe("shaft");
  });

  it("keeps both polygon records; geometry is not collapsed", () => {
    const podium = makeBuilding("podium", 36, [PODIUM_RING]);
    const shaft = makeBuilding("shaft", 198, [SHAFT_RING]);
    const { buildings } = buildClusters([podium, shaft]);

    expect(buildings).toHaveLength(2);

    const podiumOut = buildings.find((b) => b.id === "podium")!;
    const shaftOut = buildings.find((b) => b.id === "shaft")!;

    // Heights are NOT bumped; each building keeps its own height.
    expect(podiumOut.height.value).toBe(36);
    expect(shaftOut.height.value).toBe(198);
  });

  it("sets isTallestInCluster correctly", () => {
    const podium = makeBuilding("podium", 36, [PODIUM_RING]);
    const shaft = makeBuilding("shaft", 198, [SHAFT_RING]);
    const { buildings } = buildClusters([podium, shaft]);

    const podiumOut = buildings.find((b) => b.id === "podium")!;
    const shaftOut = buildings.find((b) => b.id === "shaft")!;

    expect(shaftOut.isTallestInCluster).toBe(true);
    expect(podiumOut.isTallestInCluster).toBe(false);
  });

  it("keeps a separate, non-overlapping building in its own cluster", () => {
    const podium = makeBuilding("podium", 36, [PODIUM_RING]);
    const shaft = makeBuilding("shaft", 198, [SHAFT_RING]);
    const other = makeBuilding("other", 25, [SEPARATE_RING]);
    const { buildings, clusters } = buildClusters([podium, shaft, other]);

    const clusterIds = new Set(buildings.map((b) => b.clusterId));
    expect(clusterIds.size).toBe(2);
    expect(Object.keys(clusters)).toHaveLength(2);

    const otherOut = buildings.find((b) => b.id === "other")!;
    // A singleton cluster has isTallestInCluster true.
    expect(otherOut.isTallestInCluster).toBe(true);
  });
});
