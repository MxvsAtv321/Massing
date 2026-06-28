import * as path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { cityFiles, DEFAULT_CITY } from "../src/model/cities";
import { loadRoadNetwork } from "../src/network/build";
import { deriveCordon } from "../src/traffic/deriveCordon";
import { exampleScenario, summariseConservation, validateFlow, type CordonSide } from "../src/traffic/demand";

// Structural gate for the auto-derived cordon (I5). Demand is an assumption, so there is no falsification
// oracle; this proves the cordon the engine derives from the road graph is well-formed on any city, with
// no hand-placed gateways: distinct connectors, through-direction coverage, and a balanced example
// scenario. Usage: pnpm verify:demand [cityId]

async function main(): Promise<void> {
  const cityId = process.argv[2] ?? DEFAULT_CITY;
  const root = path.resolve(__dirname, "..");
  const files = cityFiles(root, cityId);
  const model = await loadCityModel(files.footprints, files.manifest);
  const network = loadRoadNetwork(files.network, model.originLatLon);

  const places = deriveCordon(network);
  console.log(`Auto-cordon: ${cityId}, ${places.length} gateways derived from the road graph`);
  console.log("");

  let failed = false;
  const fail = (msg: string) => {
    console.error(`FAIL ${msg}`);
    failed = true;
  };

  // -- Check 1: gateways exist and connect to distinct nodes ------------------
  if (places.length === 0) fail("no boundary gateways derived");
  const connectors = new Set<string>();
  for (const p of places) {
    if (connectors.has(p.connectorNodeId)) fail(`gateway ${p.id} shares a connector node`);
    connectors.add(p.connectorNodeId);
  }

  // -- Check 2: through-direction coverage ------------------------------------
  const bySide: Record<CordonSide, number> = { N: 0, E: 0, S: 0, W: 0 };
  for (const p of places) bySide[p.side]++;
  console.log("Coverage");
  console.log(`  per side: N ${bySide.N}  E ${bySide.E}  S ${bySide.S}  W ${bySide.W}`);
  console.log(`  distinct connector nodes: ${connectors.size}/${places.length}`);
  if (bySide.E < 1 || bySide.W < 1) {
    fail("through directions incomplete (need at least one E and one W gateway)");
  }
  console.log("");

  // -- Check 3: the example scenario is valid and conserved -------------------
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
  console.log("Example scenario");
  console.log(`  ${flows.length} flows, ${cons.totalTrips} trips/hour total, balanced: ${cons.balanced}`);
  console.log(`  invalid flows: ${badFlows}`);
  if (!cons.balanced) fail("example scenario is not per-gateway balanced");
  console.log("");

  if (failed) {
    console.error("GATE FAILED");
    process.exit(1);
  }
  console.log("GATE PASSED (auto-cordon structural, no hand-placed gateways)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
