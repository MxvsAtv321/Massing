import type { RawNode, RawWay, RawWayTags, RoadClass } from "./types";
import { parseRoadClass } from "./tags";

// An undirected segment between two graph vertices, carrying the ordered OSM node refs
// (including intermediate shape nodes) and the parent way's class and tags.
export type Segment = {
  osmWayId: number;
  roadClass: RoadClass;
  tags: RawWayTags;
  nodeRefs: number[]; // >= 2 OSM node ids: vertex -> shape... -> vertex
};

export type TopologyResult = {
  segments: Segment[];
  excludedDanglingWays: number; // ways referencing a node missing from the snapshot
};

// Build undirected segments from raw nodes and ways.
//
// OSM ways thread through many nodes. The graph vertices are intersections and dead
// ends: a node is a vertex if it is a way endpoint, is shared by more than one drivable
// way, or repeats within a single way (self-intersection or closed loop). Ways are split
// into segments between consecutive vertices, keeping intermediate shape nodes in the
// segment geometry. Non-drivable ways and ways with a missing node ref are dropped.
export function buildUndirectedSegments(
  rawNodes: RawNode[],
  rawWays: RawWay[]
): TopologyResult {
  const nodeSet = new Set(rawNodes.map((n) => n.id));

  type PreparedWay = { way: RawWay; roadClass: RoadClass };
  const prepared: PreparedWay[] = [];
  let excludedDanglingWays = 0;

  for (const way of rawWays) {
    const roadClass = parseRoadClass(way.tags.highway);
    if (roadClass === null) continue;
    if (way.nodes.length < 2) continue;
    if (way.nodes.some((id) => !nodeSet.has(id))) {
      excludedDanglingWays++;
      continue;
    }
    prepared.push({ way, roadClass });
  }

  // Count how many distinct ways use each node (for intersection detection).
  const usage = new Map<number, number>();
  for (const { way } of prepared) {
    for (const id of new Set(way.nodes)) {
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }

  const segments: Segment[] = [];

  for (const { way, roadClass } of prepared) {
    const refs = way.nodes;
    const n = refs.length;

    // Occurrence count within this way, so self-intersections become vertices.
    const within = new Map<number, number>();
    for (const id of refs) within.set(id, (within.get(id) ?? 0) + 1);

    const isVertex = (idx: number): boolean => {
      const id = refs[idx];
      if (idx === 0 || idx === n - 1) return true; // endpoints
      if ((usage.get(id) ?? 0) > 1) return true; // shared across ways
      if ((within.get(id) ?? 0) > 1) return true; // repeats within this way
      return false;
    };

    let start = 0;
    for (let i = 1; i < n; i++) {
      if (isVertex(i)) {
        const nodeRefs = refs.slice(start, i + 1);
        if (nodeRefs.length >= 2) {
          segments.push({ osmWayId: way.id, roadClass, tags: way.tags, nodeRefs });
        }
        start = i;
      }
    }
  }

  return { segments, excludedDanglingWays };
}
