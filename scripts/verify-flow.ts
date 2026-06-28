import * as fs from "fs";
import * as path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { cityFiles } from "../src/model/cities";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { exampleScenario } from "../src/traffic/demand";
import { toRoutableGraph } from "../src/traffic/routableGraph";
import {
  assignWithBand,
  assignOnce,
  edgeCapacity,
  DEFAULT_ASSIGN_PARAMS,
  type ODNodeFlow,
} from "../src/traffic/assignment";

// Flow gate: runs the real engine on the real network and the example demand scenario.
// Flow has no ground-truth oracle yet (that is Part 4); this proves the physics is
// internally sound (conservation, satisfaction, band ordering, determinism).

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const files = cityFiles(root);
  const model = await loadCityModel(files.footprints, files.manifest);
  const network = loadRoadNetwork(files.network, model.originLatLon);
  const cordon: CordonFile = JSON.parse(fs.readFileSync(files.cordon, "utf8"));

  const graph = toRoutableGraph(network);
  const { places } = resolveCordon(network, cordon);
  const connectorOf = new Map(places.map((p) => [p.id, p.connectorNodeId]));

  const od: ODNodeFlow[] = exampleScenario(places).map((f) => ({
    fromNodeId: connectorOf.get(f.fromPlaceId)!,
    toNodeId: connectorOf.get(f.toPlaceId)!,
    tripsPerHour: f.tripsPerHour,
  }));
  const totalDemand = od.reduce((s, f) => s + f.tripsPerHour, 0);

  console.log(`Flow: ${graph.edges.length} edges, ${od.length} OD flows, ${totalDemand} trips/hour`);
  const result = assignWithBand(graph, od);
  console.log(
    `  vehicle-km: ${result.totalVehKmMid.toFixed(0)} ` +
      `[${result.totalVehKmLow.toFixed(0)}, ${result.totalVehKmHigh.toFixed(0)}]`
  );
  console.log(`  congested links (v/c > 0.9): ${result.congestedEdges}, max v/c ${result.maxVOverC.toFixed(2)}`);
  console.log("");

  let failed = false;
  const fail = (m: string) => {
    console.error(`FAIL ${m}`);
    failed = true;
  };

  // -- Check 1: demand satisfaction ------------------------------------------
  console.log("Demand satisfaction");
  console.log(`  unroutable OD pairs: ${result.unroutable.length}`);
  if (result.unroutable.length > 0) fail(`${result.unroutable.length} OD pairs have no path`);
  console.log("");

  // -- Check 2: flow conservation --------------------------------------------
  // out - in at each node must equal trips generated minus attracted there.
  const net = new Map<string, number>();
  for (const f of od) {
    net.set(f.fromNodeId, (net.get(f.fromNodeId) ?? 0) + f.tripsPerHour);
    net.set(f.toNodeId, (net.get(f.toNodeId) ?? 0) - f.tripsPerHour);
  }
  const outv = new Map<string, number>();
  const inv = new Map<string, number>();
  for (const e of graph.edges) {
    const ef = result.perEdge.get(e.id)!;
    outv.set(e.from, (outv.get(e.from) ?? 0) + ef.volumeMid);
    inv.set(e.to, (inv.get(e.to) ?? 0) + ef.volumeMid);
  }
  let worstImbalance = 0;
  for (const n of graph.nodes) {
    const balance = (outv.get(n.id) ?? 0) - (inv.get(n.id) ?? 0);
    const want = net.get(n.id) ?? 0;
    const err = Math.abs(balance - want);
    if (err > worstImbalance) worstImbalance = err;
  }
  console.log("Flow conservation");
  console.log(`  worst node imbalance: ${worstImbalance.toFixed(4)} veh/hour`);
  if (worstImbalance > 1.0) fail(`node flow imbalance ${worstImbalance.toFixed(3)} exceeds 1 veh/hour`);
  console.log("");

  // -- Check 3: band ordering and spread -------------------------------------
  let orderingOk = true;
  let bandedEdges = 0;
  for (const ef of result.perEdge.values()) {
    const volOk = ef.volumeLow <= ef.volumeMid + 1e-6 && ef.volumeMid <= ef.volumeHigh + 1e-6;
    const vcOk = ef.vcLow <= ef.vcMid + 1e-6 && ef.vcMid <= ef.vcHigh + 1e-6;
    const spOk = ef.speedLowKph <= ef.speedMidKph + 1e-6 && ef.speedMidKph <= ef.speedHighKph + 1e-6;
    if (!volOk || !vcOk || !spOk) orderingOk = false;
    if (ef.vcMid > 0.05 && ef.bandWidthRel > 0.01) bandedEdges++;
  }
  console.log("Band");
  console.log(`  ordering low<=mid<=high (vol, v/c, speed): ${orderingOk}; loaded edges with a band: ${bandedEdges}`);
  if (!orderingOk) fail("band ordering violated on some edge");
  if (bandedEdges === 0) fail("band is zero on every loaded edge (ensemble produced no spread)");
  console.log("");

  // -- Check 4: free-flow sanity ---------------------------------------------
  const tiny: ODNodeFlow[] = od.map((f) => ({ ...f, tripsPerHour: f.tripsPerHour * 0.001 }));
  const tinyRun = assignOnce(graph, tiny, DEFAULT_ASSIGN_PARAMS);
  let maxTinyVC = 0;
  graph.edges.forEach((e, i) => {
    const cap = edgeCapacity(e, DEFAULT_ASSIGN_PARAMS, 1);
    const vc = cap > 0 ? tinyRun.volume[i] / cap : 0;
    if (vc > maxTinyVC) maxTinyVC = vc;
  });
  console.log("Free-flow sanity");
  console.log(`  max v/c under tiny demand: ${maxTinyVC.toFixed(4)}`);
  if (maxTinyVC > 0.05) fail(`tiny demand should stay uncongested (max v/c ${maxTinyVC.toFixed(3)})`);
  console.log("");

  // -- Check 5: determinism --------------------------------------------------
  const again = assignWithBand(graph, od);
  let deterministic = again.perEdge.size === result.perEdge.size;
  for (const [id, a] of result.perEdge) {
    const b = again.perEdge.get(id);
    if (!b || b.volumeMid !== a.volumeMid || b.volumeLow !== a.volumeLow || b.volumeHigh !== a.volumeHigh) {
      deterministic = false;
      break;
    }
  }
  console.log("Determinism");
  console.log(`  identical re-run: ${deterministic}`);
  if (!deterministic) fail("assignment is not deterministic");
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
