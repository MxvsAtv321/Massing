import { describe, it, expect } from "vitest";
import {
  buildClusterRepHeights,
  buildBuildingClusterMap,
  buildInstanceClusterIds,
  resolveClusterFromBatchId,
} from "../src/render/cityIndex";
import type { BuildingForScene } from "../src/mutation/building";
import type { ClusterIndexEntry } from "../src/model/types";

function bld(id: string, clusterId: string): BuildingForScene {
  return { id, clusterId, footprint: [], heightValue: 10, confidenceKind: "measured" };
}

describe("buildClusterRepHeights", () => {
  it("maps each clusterId to its representative height", () => {
    const clusters: Record<string, ClusterIndexEntry> = {
      c0: { clusterId: "c0", representativeHeight_m: 42, memberIds: ["a"], tallestMemberId: "a" },
      c1: { clusterId: "c1", representativeHeight_m: 7.5, memberIds: ["b", "c"], tallestMemberId: "b" },
    };
    const m = buildClusterRepHeights(clusters);
    expect(m.get("c0")).toBe(42);
    expect(m.get("c1")).toBe(7.5);
    expect(m.size).toBe(2);
  });
});

describe("buildBuildingClusterMap", () => {
  it("maps each building id to its clusterId", () => {
    const m = buildBuildingClusterMap([bld("a", "c0"), bld("b", "c1"), bld("c", "c1")]);
    expect(m.get("a")).toBe("c0");
    expect(m.get("b")).toBe("c1");
    expect(m.get("c")).toBe("c1");
  });
});

describe("buildInstanceClusterIds", () => {
  it("aligns instance order to clusterIds via the id map", () => {
    const idToCluster = buildBuildingClusterMap([bld("a", "c0"), bld("b", "c1"), bld("c", "c1")]);
    // The geometry order from cityGeometry can reorder or drop inputs; the
    // ordered ids it returns are the source of truth, not the input order.
    const ordered = ["b", "a", "c"];
    expect(buildInstanceClusterIds(ordered, idToCluster)).toEqual(["c1", "c0", "c1"]);
  });
  it("emits an empty string for an id with no mapping", () => {
    const idToCluster = buildBuildingClusterMap([bld("a", "c0")]);
    expect(buildInstanceClusterIds(["a", "ghost"], idToCluster)).toEqual(["c0", ""]);
  });
});

describe("resolveClusterFromBatchId", () => {
  const ids = ["c0", "c1", ""];
  it("resolves a valid batchId to its clusterId", () => {
    expect(resolveClusterFromBatchId(0, ids)).toBe("c0");
    expect(resolveClusterFromBatchId(1, ids)).toBe("c1");
  });
  it("returns null for undefined, out of range, or an empty mapping", () => {
    expect(resolveClusterFromBatchId(undefined, ids)).toBeNull();
    expect(resolveClusterFromBatchId(-1, ids)).toBeNull();
    expect(resolveClusterFromBatchId(3, ids)).toBeNull();
    expect(resolveClusterFromBatchId(2, ids)).toBeNull(); // empty string -> null
  });
});
