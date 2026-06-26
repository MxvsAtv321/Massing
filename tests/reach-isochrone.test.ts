import { describe, it, expect } from "vitest";
import { walkIsochrone } from "../src/reach/isochrone";
import type { StitchGraph, StitchNode, StitchEdge } from "../src/generate/stitch";

function makeGraph(nodes: StitchNode[], undirected: [string, string, number][]): StitchGraph {
  const edges: StitchEdge[] = [];
  for (const [a, b, len] of undirected) {
    edges.push({ from: a, to: b, lengthMetres: len });
    edges.push({ from: b, to: a, lengthMetres: len });
  }
  const adjacency = new Map<string, number[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  edges.forEach((e, i) => {
    const l = adjacency.get(e.from);
    if (l) l.push(i);
    else adjacency.set(e.from, [i]);
  });
  return { nodes, edges, adjacency };
}

const NODES: StitchNode[] = [
  { id: "a", enu: [0, 0] },
  { id: "b", enu: [100, 0] },
  { id: "c", enu: [200, 0] },
  { id: "frag", enu: [1000, 1000] }, // no edges: a disconnected fragment
];
const GRAPH = makeGraph(NODES, [["a", "b", 100], ["b", "c", 100]]);

describe("walkIsochrone", () => {
  it("computes minutes from a single source over edge lengths", () => {
    const iso = walkIsochrone(GRAPH, ["a"], 1.0); // 1 m/s
    expect(iso.minutes.get("a")).toBeCloseTo(0, 6);
    expect(iso.minutes.get("b")).toBeCloseTo(100 / 60, 4); // 100 m / 1 m/s = 100 s
    expect(iso.minutes.get("c")).toBeCloseTo(200 / 60, 4);
  });

  it("takes the minimum over multiple sources", () => {
    const iso = walkIsochrone(GRAPH, ["a", "c"], 1.0);
    expect(iso.minutes.get("a")).toBeCloseTo(0, 6);
    expect(iso.minutes.get("c")).toBeCloseTo(0, 6);
    expect(iso.minutes.get("b")).toBeCloseTo(100 / 60, 4); // the nearer of a or c
  });

  it("reports a disconnected fragment as unreachable (absent), never a small isochrone", () => {
    const iso = walkIsochrone(GRAPH, ["a"], 1.0);
    expect(iso.minutes.get("frag")).toBeUndefined();
  });
});
