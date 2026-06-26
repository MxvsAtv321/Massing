import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { GenerativeOpSchema, type GenerativeOp } from "../src/generate/op";
import { expandDistrict } from "../src/generate/expand";
import { walkIsochrone } from "../src/reach/isochrone";
import type { RealGraph } from "../src/generate/stitch";
import type { GeneratedDistrict, GenerativeContext } from "../src/generate/types";

// The reachability ground-truth gate (G4, ADR-R22). A walk isochrone over a mis-stitched graph
// produces a confident, plausible, wrong answer, an isochrone that reads like a real reachable area
// over a network that does not connect the way the rendered streets suggest. That is the exact
// confidently-wrong failure this project refuses, and it is the headline "park reachable in five
// minutes" claim, so it is gated hard like verify-network. Two checks, both must pass:
//  1. A known district origin reaches a real anchor with a physically-bounded walk-time: finite, and
//     at least the straight-line time (you cannot walk faster than a straight line), at most a
//     generous network-detour bound. A mis-stitched or wrong-length graph fails this.
//  2. The degenerate case: with no connectors (snap 0) the district is an unstitched fragment, and
//     the origin must report UNREACHABLE, never a small plausible isochrone.

const WALK_MPS = 1.4;

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

async function main(): Promise<void> {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
  );
  const network = loadRoadNetwork(
    path.join(process.cwd(), "data", "network.json"),
    model.originLatLon
  );
  const realGraph: RealGraph = {
    nodes: network.nodes.map((n) => ({ id: n.id, enu: n.enu })),
    edges: network.edges.map((e) => ({ from: e.from, to: e.to, lengthMetres: e.lengthMetres })),
  };

  // District over the network centroid, where real nodes are dense enough to stitch.
  let cx = 0;
  let cy = 0;
  for (const n of network.nodes) {
    cx += n.enu[0];
    cy += n.enu[1];
  }
  cx /= network.nodes.length;
  cy /= network.nodes.length;

  const ops: GenerativeOp[] = [
    { op: "LayStreets", district: "s", pattern: "grid", blockSizeM: 80, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true },
    { op: "FillBlocks", district: "s", program: "residential", target: { unitsPerHa: 600 }, heightEnvelope: { minStoreys: 8, maxStoreys: 8 }, coverage: 0.4 },
  ].map((o) => GenerativeOpSchema.parse(o));
  const district: GeneratedDistrict = {
    id: "s",
    seed: 1,
    region: { kind: "rect", center: [cx, cy], halfExtents: [120, 120], rotationRad: 0 },
    ops,
    clearedClusterIds: [],
  };
  const ctx: GenerativeContext = {
    namedRegions: {},
    streets: {},
    districtBoundaries: {},
    clusterCentroids: {},
    realGraph,
  };

  const stitched = expandDistrict(district, ctx, { metresPerStorey: 3, snapRadiusM: 60 });
  const unstitched = expandDistrict(district, ctx, { metresPerStorey: 3, snapRadiusM: 0 });

  // A real anchor (nearest real node to the district center) and a district grid origin.
  let anchor = realGraph.nodes[0];
  let aBest = Infinity;
  for (const n of realGraph.nodes) {
    const d = dist(n.enu, [cx, cy]);
    if (d < aBest) {
      aBest = d;
      anchor = n;
    }
  }
  const origin = stitched.graph.nodes.find((n) => n.id.startsWith("g:"));
  if (!origin) throw new Error("no grid origin node");

  const straightMin = dist(origin.enu, anchor.enu) / WALK_MPS / 60;
  const upperMin = straightMin * 4 + 1; // generous detour bound plus slack for short hops

  const tStitched = walkIsochrone(stitched.graph, [anchor.id], WALK_MPS).minutes.get(origin.id) ?? Infinity;
  const reachableOk =
    stitched.gate.connected && Number.isFinite(tStitched) && tStitched >= straightMin - 1e-6 && tStitched <= upperMin;

  const tUnstitched = walkIsochrone(unstitched.graph, [anchor.id], WALK_MPS).minutes.get(origin.id) ?? Infinity;
  const unreachableOk = !Number.isFinite(tUnstitched);

  console.log("[verify:reachability] district origin to real anchor");
  console.log(`  gate connected: ${stitched.gate.connected}`);
  console.log(`  straight-line: ${straightMin.toFixed(2)} min, network walk: ${tStitched.toFixed(2)} min, bound <= ${upperMin.toFixed(2)} min`);
  console.log(`  reachable check: ${reachableOk ? "PASS" : "FAIL"}`);
  console.log(`  unstitched (snap 0) origin walk: ${Number.isFinite(tUnstitched) ? tUnstitched.toFixed(2) + " min" : "unreachable"}`);
  console.log(`  unreachable-fragment check: ${unreachableOk ? "PASS" : "FAIL"}`);

  if (!reachableOk || !unreachableOk) {
    console.error("[verify:reachability] FAILED");
    process.exit(1);
  }
  console.log("[verify:reachability] OK");
}

void main();
