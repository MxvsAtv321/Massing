import * as fs from "fs";
import * as path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { cityFiles } from "../src/model/cities";
import { loadRoadNetwork } from "../src/network/build";
import { analyzeConnectivity } from "../src/network/connectivity";
import { dijkstra } from "../src/network/shortestPath";
import { enuToLonLat, haversineLengthLonLat } from "../src/network/geometry";
import { lonLatToEnu } from "../src/coords/enu";
import type { RoadNetwork, NetworkNode } from "../src/network/types";

// Routing ground-truth shape (data/known-routes.json).
type LonLat = [number, number];
type KnownRoutes = {
  tolerance_pct: number;
  intersections: Record<string, { lonlat: LonLat; name: string }>;
  routes: { from: string; to: string; groundTruthMetres: number; note?: string }[];
  onewayChecks: { name: string; fromLonlat: LonLat; toLonlat: LonLat; note?: string }[];
  alignmentChecks: { name: string; lonlat: LonLat; maxNodeDistMetres: number }[];
};

// Gate thresholds.
const DOMINANCE_MIN = 0.8; // kept SCC must be at least this fraction of pre-prune nodes
const LENGTH_REL_TOL = 0.005; // 0.5%
const LENGTH_ABS_TOL_M = 0.5;
const ABSURD_EDGE_M = 1500; // a single drivable segment longer than this is suspicious

function nearestNode(
  network: RoadNetwork,
  ex: number,
  ey: number
): { node: NetworkNode; dist: number } {
  let best: NetworkNode = network.nodes[0];
  let bestDist = Infinity;
  for (const n of network.nodes) {
    const d = Math.hypot(n.enu[0] - ex, n.enu[1] - ey);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return { node: best, dist: bestDist };
}

function hasEdge(network: RoadNetwork, fromId: string, toId: string): boolean {
  const out = network.adjacency.get(fromId) ?? [];
  return out.some((ei) => network.edges[ei].to === toId);
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const files = cityFiles(root);
  const model = await loadCityModel(files.footprints, files.manifest);
  const network = loadRoadNetwork(files.network, model.originLatLon);
  const known: KnownRoutes = JSON.parse(fs.readFileSync(files.knownRoutes, "utf8"));

  const [lon0, lat0] = model.originLatLon;
  const cov = network.coverage;

  console.log("Loaded road network");
  console.log(`  origin lon,lat: [${lon0.toFixed(6)}, ${lat0.toFixed(6)}]`);
  console.log(`  coverage: ${JSON.stringify(cov)}`);
  console.log("");

  let failed = false;
  const fail = (msg: string) => {
    console.error(`FAIL ${msg}`);
    failed = true;
  };

  // -- Check 1: connectivity -------------------------------------------------
  const conn = analyzeConnectivity(network);
  const dominance =
    cov.graphNodesBeforePrune > 0 ? cov.graphNodes / cov.graphNodesBeforePrune : 0;
  console.log("Connectivity");
  console.log(
    `  kept ${cov.graphNodes}/${cov.graphNodesBeforePrune} nodes ` +
      `(${(dominance * 100).toFixed(1)}% dominant), pruned ${cov.strandedNodes} ` +
      `in ${cov.strandedComponents} fringe components`
  );
  if (conn.components !== 1) {
    fail(`loaded network is not a single SCC (${conn.components} components)`);
  }
  if (conn.strandedNodeIds.length !== 0) {
    fail(`loaded network has ${conn.strandedNodeIds.length} stranded nodes after prune`);
  }
  if (!cov.connected) fail("coverage.connected is false");
  if (dominance < DOMINANCE_MIN) {
    fail(`dominant component is only ${(dominance * 100).toFixed(1)}% (< ${DOMINANCE_MIN * 100}%)`);
  }
  console.log(`  result: ${conn.components === 1 && conn.strandedNodeIds.length === 0 ? "PASS" : "FAIL"}`);
  console.log("");

  // -- Check 2: geometry (ENU length vs independent geodesic length) ----------
  let lenWorstRel = 0;
  let zeroLen = 0;
  let absurd = 0;
  for (const e of network.edges) {
    if (!(e.lengthMetres > 0)) {
      zeroLen++;
      continue;
    }
    if (e.lengthMetres > ABSURD_EDGE_M) absurd++;
    const lonlat = e.geometry.map(([x, y]) => enuToLonLat(x, y, lon0, lat0));
    const geo = haversineLengthLonLat(lonlat);
    const rel = Math.abs(e.lengthMetres - geo) / geo;
    if (rel > lenWorstRel) lenWorstRel = rel;
    if (rel > LENGTH_REL_TOL && Math.abs(e.lengthMetres - geo) > LENGTH_ABS_TOL_M) {
      fail(`edge ${e.id} length ${e.lengthMetres.toFixed(2)} vs geodesic ${geo.toFixed(2)} (${(rel * 100).toFixed(2)}%)`);
    }
  }
  console.log("Geometry");
  console.log(`  ${network.edges.length} edges, worst ENU-vs-geodesic ${(lenWorstRel * 100).toFixed(3)}%`);
  console.log(`  zero-length kept edges: ${zeroLen} (build excluded ${cov.excludedZeroLength})`);
  console.log(`  edges over ${ABSURD_EDGE_M} m: ${absurd}`);
  if (zeroLen > 0) fail(`${zeroLen} zero-length edges present in the graph`);
  console.log(`  result: ${zeroLen === 0 && lenWorstRel <= LENGTH_REL_TOL ? "PASS" : absurd === 0 && zeroLen === 0 ? "PASS (within abs tol)" : "see failures"}`);
  console.log("");

  // -- Check 3: oneway correctness -------------------------------------------
  console.log("Oneway");
  for (const c of known.onewayChecks) {
    const a = nearestNode(network, ...lonLatToEnu(c.fromLonlat[0], c.fromLonlat[1], lon0, lat0));
    const b = nearestNode(network, ...lonLatToEnu(c.toLonlat[0], c.toLonlat[1], lon0, lat0));
    const fwd = hasEdge(network, a.node.id, b.node.id);
    const rev = hasEdge(network, b.node.id, a.node.id);
    const ok = fwd && !rev;
    console.log(`  ${c.name}: forward=${fwd} reverse=${rev} -> ${ok ? "PASS" : "FAIL"}`);
    if (!ok) fail(`oneway ${c.name} (forward=${fwd}, reverse=${rev}; want forward=true reverse=false)`);
  }
  console.log("");

  // -- Check 4: known routes -------------------------------------------------
  const tol = known.tolerance_pct / 100;
  const header = `  ${"Route".padEnd(40)} ${"Ground".padStart(8)} ${"Routed".padStart(8)} ${"Delta".padStart(8)}  Result`;
  console.log("Known routes");
  console.log(header);
  for (const r of known.routes) {
    const fi = known.intersections[r.from];
    const ti = known.intersections[r.to];
    if (!fi || !ti) {
      fail(`route references unknown intersection ${r.from} or ${r.to}`);
      continue;
    }
    const a = nearestNode(network, ...lonLatToEnu(fi.lonlat[0], fi.lonlat[1], lon0, lat0));
    const b = nearestNode(network, ...lonLatToEnu(ti.lonlat[0], ti.lonlat[1], lon0, lat0));
    const res = dijkstra(network, a.node.id, b.node.id);
    const label = `${fi.name} -> ${ti.name}`;
    if (!res) {
      console.log(`  ${label.padEnd(40)} ${String(r.groundTruthMetres).padStart(8)} ${"NULL".padStart(8)}`);
      fail(`no route ${label}`);
      continue;
    }
    const delta = res.distance - r.groundTruthMetres;
    const rel = Math.abs(delta) / r.groundTruthMetres;
    const ok = rel <= tol;
    console.log(
      `  ${label.padEnd(40)} ${r.groundTruthMetres.toFixed(0).padStart(8)} ${res.distance.toFixed(0).padStart(8)} ${((delta >= 0 ? "+" : "") + delta.toFixed(0)).padStart(8)}  ${ok ? "PASS" : "FAIL"}`
    );
    if (!ok) fail(`route ${label} off by ${(rel * 100).toFixed(1)}% (> ${known.tolerance_pct}%)`);
  }
  console.log("");

  // -- Check 5: alignment ----------------------------------------------------
  console.log("Alignment");
  if (network.originLatLon[0] !== lon0 || network.originLatLon[1] !== lat0) {
    fail("network origin does not equal city-model origin");
  } else {
    console.log("  network origin equals city-model origin: PASS");
  }
  for (const c of known.alignmentChecks) {
    const [ex, ey] = lonLatToEnu(c.lonlat[0], c.lonlat[1], lon0, lat0);
    const near = nearestNode(network, ex, ey);
    const ok = near.dist <= c.maxNodeDistMetres;
    console.log(`  ${c.name}: nearest road node ${near.dist.toFixed(1)} m (<= ${c.maxNodeDistMetres}) -> ${ok ? "PASS" : "FAIL"}`);
    if (!ok) fail(`alignment ${c.name} nearest node ${near.dist.toFixed(1)} m > ${c.maxNodeDistMetres} m`);
  }
  console.log("");

  if (failed) {
    console.error("GATE FAILED");
    process.exit(1);
  }
  console.log("GATE PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
