import * as fs from "fs";
import * as path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { cityFiles } from "../src/model/cities";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import { exampleScenario } from "../src/traffic/demand";
import { toRoutableGraph } from "../src/traffic/routableGraph";
import { assignWithBand, type ODNodeFlow } from "../src/traffic/assignment";
import {
  toEnuStations,
  matchCountsToEdges,
  validateFlow,
  gehStatistic,
  type CountsFile,
} from "../src/traffic/validation";

// Validation gate: proves the harness is correct (counts well-formed, GEH exact, matcher
// resolves) and REPORTS the real-count fit under the example demand. It passes on harness
// correctness, not on the model being right (ADR-010, flag A).

const MATCH_DIST_M = 30;
const MIN_MATCHED = 20;

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const files = cityFiles(root);
  const model = await loadCityModel(files.footprints, files.manifest);
  const network = loadRoadNetwork(files.network, model.originLatLon);
  const cordon: CordonFile = JSON.parse(fs.readFileSync(files.cordon, "utf8"));
  const counts: CountsFile = JSON.parse(fs.readFileSync(files.counts, "utf8"));

  console.log(`Counts: ${counts.stations.length} stations from "${counts.provenance.dataset}"`);
  console.log(`  retrieved ${counts.provenance.retrievedDate}, ${counts.provenance.api}`);
  console.log("");

  let failed = false;
  const fail = (m: string) => {
    console.error(`FAIL ${m}`);
    failed = true;
  };

  // -- Check 1: counts well-formed and inside the catchment -------------------
  const b = counts.provenance.bbox;
  let outOfBox = 0;
  for (const s of counts.stations) {
    const [lon, lat] = s.lonlat;
    if (lat < b.south || lat > b.north || lon < b.west || lon > b.east) outOfBox++;
  }
  console.log("Counts well-formed");
  console.log(`  stations: ${counts.stations.length}, outside bbox: ${outOfBox}`);
  if (counts.stations.length === 0) fail("no count stations");
  if (outOfBox > 0) fail(`${outOfBox} stations fall outside the declared bbox`);
  console.log("");

  // -- Check 2: GEH math ------------------------------------------------------
  const gehIdentity = gehStatistic(500, 500);
  const gehSym = Math.abs(gehStatistic(300, 700) - gehStatistic(700, 300));
  const gehMono = gehStatistic(500, 900) > gehStatistic(500, 700);
  // Hand value: M=200, C=100 -> sqrt(2*100^2/300) = sqrt(66.67) ~ 8.165
  const gehHand = Math.abs(gehStatistic(200, 100) - Math.sqrt((2 * 100 * 100) / 300));
  console.log("GEH statistic");
  console.log(`  identity ${gehIdentity}, symmetric diff ${gehSym.toExponential(1)}, monotonic ${gehMono}`);
  if (gehIdentity !== 0) fail("GEH is not zero when modeled equals counted");
  if (gehSym > 1e-9) fail("GEH is not symmetric");
  if (!gehMono) fail("GEH is not monotonic in the gap");
  if (gehHand > 1e-9) fail("GEH hand value mismatch");
  console.log("");

  // -- Build the flow under the example demand --------------------------------
  const graph = toRoutableGraph(network);
  const { places } = resolveCordon(network, cordon);
  const connectorOf = new Map(places.map((p) => [p.id, p.connectorNodeId]));
  const od: ODNodeFlow[] = exampleScenario(places).map((f) => ({
    fromNodeId: connectorOf.get(f.fromPlaceId)!,
    toNodeId: connectorOf.get(f.toPlaceId)!,
    tripsPerHour: f.tripsPerHour,
  }));
  const flow = assignWithBand(graph, od);

  // -- Check 3: matcher resolves a healthy fraction ---------------------------
  const stations = toEnuStations(counts, model.originLatLon);
  const { matches, unmatched } = matchCountsToEdges(stations, graph.edges, MATCH_DIST_M);
  console.log("Matching");
  console.log(`  ${matches.length}/${stations.length} stations matched within ${MATCH_DIST_M} m (${unmatched.length} unmatched)`);
  if (matches.length < MIN_MATCHED) fail(`only ${matches.length} stations matched (< ${MIN_MATCHED})`);
  console.log("");

  // -- Report the fit (no threshold assertion) --------------------------------
  const v = validateFlow(matches, flow, stations.length);
  console.log("Fit under the example demand (reported, not gated)");
  console.log(`  median GEH ${v.medianGeh.toFixed(1)}`);
  console.log(`  within GEH<5: ${v.pctUnder5.toFixed(0)}%   within GEH<10: ${v.pctUnder10.toFixed(0)}%`);
  const worst = [...v.perStation].sort((a, c) => c.geh - a.geh).slice(0, 5);
  console.log("  worst-fitting stations (simulated vs measured):");
  for (const s of worst) {
    console.log(`    GEH ${s.geh.toFixed(1).padStart(5)}  sim ${Math.round(s.simulated).toString().padStart(5)}  meas ${s.measured.toString().padStart(5)}  ${s.name}`);
  }
  const best = [...v.perStation].sort((a, c) => a.geh - c.geh).slice(0, 5);
  console.log("  best-fitting stations:");
  for (const s of best) {
    console.log(`    GEH ${s.geh.toFixed(1).padStart(5)}  sim ${Math.round(s.simulated).toString().padStart(5)}  meas ${s.measured.toString().padStart(5)}  ${s.name}`);
  }
  console.log("");

  if (failed) {
    console.error("GATE FAILED");
    process.exit(1);
  }
  console.log("GATE PASSED (harness correct; fit reported above, not asserted)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
