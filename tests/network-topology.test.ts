import { describe, it, expect } from "vitest";
import { buildUndirectedSegments } from "../src/network/topology";
import type { RawNode, RawWay, RawWayTags } from "../src/network/types";

function node(id: number): RawNode {
  return { id, lon: -79.375 + id * 0.0001, lat: 43.65 + id * 0.0001 };
}

function way(id: number, nodes: number[], highway = "residential"): RawWay {
  const tags: RawWayTags = {
    highway,
    name: null,
    oneway: null,
    lanes: null,
    maxspeed: null,
    junction: null,
  };
  return { id, nodes, tags };
}

function refsOf(segs: { nodeRefs: number[] }[]): number[][] {
  return segs.map((s) => s.nodeRefs).sort((a, b) => a.join("-").localeCompare(b.join("-")));
}

describe("buildUndirectedSegments", () => {
  it("splits a way at an interior node shared with another way", () => {
    const nodes = [1, 2, 3, 4, 5, 6].map(node);
    const ways = [
      way(10, [1, 2, 3, 4, 5]), // node 3 is interior
      way(11, [3, 6]), // shares node 3 -> makes it a vertex
    ];
    const { segments, excludedDanglingWays } = buildUndirectedSegments(nodes, ways);
    expect(excludedDanglingWays).toBe(0);
    // way 10 splits into [1,2,3] and [3,4,5]; way 11 stays [3,6].
    expect(refsOf(segments)).toEqual([
      [1, 2, 3],
      [3, 4, 5],
      [3, 6],
    ]);
  });

  it("keeps a simple way with no shared interior nodes as one segment", () => {
    const nodes = [1, 2, 3].map(node);
    const { segments } = buildUndirectedSegments(nodes, [way(10, [1, 2, 3])]);
    expect(segments).toHaveLength(1);
    expect(segments[0].nodeRefs).toEqual([1, 2, 3]);
  });

  it("keeps a closed loop (first == last) as a single segment", () => {
    const nodes = [7, 8, 9].map(node);
    const { segments } = buildUndirectedSegments(nodes, [way(20, [7, 8, 9, 7])]);
    expect(segments).toHaveLength(1);
    expect(segments[0].nodeRefs).toEqual([7, 8, 9, 7]);
  });

  it("splits at a self-intersection (a repeated interior node)", () => {
    const nodes = [10, 11, 12, 13].map(node);
    // node 11 repeats: figure-eight style.
    const { segments } = buildUndirectedSegments(nodes, [way(30, [10, 11, 12, 11, 13])]);
    expect(refsOf(segments)).toEqual([
      [10, 11],
      [11, 12, 11],
      [11, 13],
    ]);
  });

  it("drops non-drivable ways and counts ways with a missing node", () => {
    const nodes = [1, 2].map(node);
    const ways = [
      way(40, [1, 2], "footway"), // dropped: not drivable
      way(41, [1, 999]), // dropped: node 999 absent -> dangling
      way(42, [1, 2]), // kept
    ];
    const { segments, excludedDanglingWays } = buildUndirectedSegments(nodes, ways);
    expect(excludedDanglingWays).toBe(1);
    expect(segments).toHaveLength(1);
    expect(segments[0].osmWayId).toBe(42);
  });
});
