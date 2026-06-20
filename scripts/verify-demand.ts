import * as fs from "fs";
import * as path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { resolveCordon, type CordonFile } from "../src/traffic/cordon";
import {
  exampleScenario,
  summariseConservation,
  validateFlow,
  type CordonSide,
} from "../src/traffic/demand";
import { lonLatToEnu } from "../src/coords/enu";

// Structural gate for the demand scenario. Demand is an assumption, so there is no
// falsification oracle; this proves the scenario is well-formed and Part-3-ready against
// the real network. Mirrors scripts/verify-network.ts.

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const model = await loadCityModel(
    path.join(root, "data", "stlawrence.geojson"),
    path.join(root, "data", "sources.json")
  );
  const network = loadRoadNetwork(
    path.join(root, "data", "network.json"),
    model.originLatLon
  );
  const cordon: CordonFile = JSON.parse(
    fs.readFileSync(path.join(root, "data", "cordon.json"), "utf8")
  );

  const { places, unresolved } = resolveCordon(network, cordon);
  const [lon0, lat0] = model.originLatLon;

  console.log(`Cordon: ${cordon.gateways.length} gateways, ${places.length} resolved`);
  console.log("");

  let failed = false;
  const fail = (msg: string) => {
    console.error(`FAIL ${msg}`);
    failed = true;
  };

  // -- Check 1: every gateway resolves within tolerance -----------------------
  console.log("Resolution");
  const header = `  ${"Gateway".padEnd(18)} ${"Side".padStart(4)} ${"Resolve m".padStart(10)}  Result`;
  console.log(header);
  for (const spec of cordon.gateways) {
    const [ex, ey] = lonLatToEnu(spec.lonlat[0], spec.lonlat[1], lon0, lat0);
    let bestDist = Infinity;
    for (const n of network.nodes) {
      const d = Math.hypot(n.enu[0] - ex, n.enu[1] - ey);
      if (d < bestDist) bestDist = d;
    }
    const ok = bestDist <= cordon.maxResolveMetres;
    console.log(
      `  ${spec.id.padEnd(18)} ${spec.side.padStart(4)} ${bestDist.toFixed(1).padStart(10)}  ${ok ? "PASS" : "FAIL"}`
    );
    if (!ok) fail(`gateway ${spec.id} resolves at ${bestDist.toFixed(1)} m (> ${cordon.maxResolveMetres} m)`);
  }
  if (unresolved.length > 0) fail(`${unresolved.length} gateways unresolved`);
  console.log("");

  // -- Check 2: distinct connectors and direction coverage --------------------
  console.log("Coverage");
  const connectors = new Set<string>();
  for (const p of places) {
    if (connectors.has(p.connectorNodeId)) {
      fail(`gateways ${p.id} shares a connector node with another gateway`);
    }
    connectors.add(p.connectorNodeId);
  }
  const bySide: Record<CordonSide, number> = { N: 0, E: 0, S: 0, W: 0 };
  for (const p of places) bySide[p.side]++;
  console.log(`  per side: N ${bySide.N}  E ${bySide.E}  S ${bySide.S}  W ${bySide.W}`);
  console.log(`  distinct connector nodes: ${connectors.size}/${places.length}`);
  if (bySide.E < 1 || bySide.W < 1) {
    fail("through directions incomplete (need at least one E and one W gateway)");
  }
  console.log("");

  // -- Check 3: the example scenario is valid and conserved -------------------
  console.log("Example scenario");
  const placeIds = new Set(places.map((p) => p.id));
  const flows = exampleScenario(places);
  let badFlows = 0;
  for (const f of flows) {
    const v = validateFlow(f, placeIds);
    if (!v.ok) {
      badFlows++;
      fail(`example flow ${f.id} invalid: ${v.reason}`);
    }
  }
  const cons = summariseConservation(places, flows);
  console.log(`  ${flows.length} flows, ${cons.totalTrips} trips/hour total, balanced: ${cons.balanced}`);
  console.log(`  invalid flows: ${badFlows}`);
  if (!cons.balanced) fail("example scenario is not per-gateway balanced");
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
