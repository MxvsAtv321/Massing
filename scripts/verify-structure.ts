import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { cityFiles, DEFAULT_CITY } from "../src/model/cities";
import { structuralAcceptance } from "../src/model/acceptance";

// The automatic per-city structural acceptance gate (I2, ADR-R25). Runs on any ingested city with NO
// hand-verified ground truth: geometry and coordinate framing (which is also sun soundness), network
// structure (reach and traffic soundness), and the per-city solar identity. This is the gate that runs
// on a city nobody hand-checked. Usage: pnpm verify:structure [cityId]

async function main(): Promise<void> {
  const cityId = process.argv[2] ?? DEFAULT_CITY;
  const files = cityFiles(process.cwd(), cityId);
  const model = await loadCityModel(files.footprints, files.manifest);
  const network = loadRoadNetwork(files.network, model.originLatLon);
  const r = structuralAcceptance(model, network);

  console.log(`Structural acceptance: ${r.cityId}`);
  console.log("");
  console.log("Geometry and coordinate framing");
  console.log(`  footprints ${r.geometry.footprints}, degenerate rings ${r.geometry.degenerateRings}`);
  console.log(
    `  framing cross-check: worst ${(r.geometry.worstLengthRelError * 100).toFixed(3)}% over ${r.geometry.checkedEdges} edges -> ${r.geometry.ok ? "PASS" : "FAIL"}`
  );
  console.log("");
  console.log("Network structure");
  console.log(
    `  components ${r.network.components}, dominance ${(r.network.dominanceFrac * 100).toFixed(1)}% (${r.network.coverage}), stranded ${r.network.strandedNodes}`
  );
  console.log(
    `  zero-length ${r.network.zeroLengthEdges}, absurd ${r.network.absurdEdges} -> ${r.network.ok ? "PASS" : "FAIL"}`
  );
  console.log("");
  console.log("Solar identity (equinox noon)");
  console.log(
    `  lat ${r.solar.latitude.toFixed(3)}: altitude ${r.solar.noonAltitudeDeg.toFixed(2)} vs analytic ${r.solar.analyticAltitudeDeg.toFixed(2)} -> ${r.solar.ok ? "PASS" : "FAIL"}`
  );
  console.log("");

  if (!r.ok) {
    console.error("STRUCTURAL GATE FAILED");
    for (const reason of r.reasons) console.error(`  - ${reason}`);
    process.exit(1);
  }
  console.log("STRUCTURAL GATE PASSED (structure sound; heights unverified and labeled, ADR-R26)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
