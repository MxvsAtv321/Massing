import fs from "fs";
import os from "os";
import path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { GenerativeOpSchema, type GenerativeOp } from "../src/generate/op";
import { expandDistrict, geometrySignature } from "../src/generate/expand";
import type { GeneratedDistrict, GenerativeContext } from "../src/generate/types";
import type { RealBoundaryNode } from "../src/generate/stitch";

// Developer sanity check for the procedural expander (G1, ADR-R18), the same shape as the other
// verify:* scripts: not a build gate, a way to exercise the math against the real snapshot. It
// expands a sample district over the real ground, stitches it to the real road network, runs the
// stitching gate (ADR-R23) on real node positions, checks run-to-run determinism, and dumps the
// result to GeoJSON for eyeball inspection.
//
// Determinism caveat (ADR-R23): this proves V8 run-to-run only. The production split is node (V8)
// versus the browser engine, which on Safari is JavaScriptCore with a different libm. That gap is
// unverified here and is recorded in the ADR, not assumed away.

async function main(): Promise<void> {
  const model = await loadCityModel(
    path.join(process.cwd(), "data", "stlawrence.geojson"),
    path.join(process.cwd(), "data", "sources.json")
  );
  const network = loadRoadNetwork(
    path.join(process.cwd(), "data", "network.json"),
    model.originLatLon
  );

  // Center a sample district on the network bounding box and take the real nodes ringing it as the
  // boundary the grid stitches to.
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
  for (const nd of network.nodes) {
    const [e, n] = nd.enu;
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
  }
  const cx = (minE + maxE) / 2;
  const cy = (minN + maxN) / 2;
  const half = 150;

  const realBoundaryNodes: RealBoundaryNode[] = network.nodes
    .map((nd) => ({ id: nd.id, enu: nd.enu, d: Math.hypot(nd.enu[0] - cx, nd.enu[1] - cy) }))
    .filter((nd) => nd.d > half * 0.9 && nd.d < half * 1.8)
    .map((nd) => ({ id: nd.id, enu: nd.enu }));

  const southEdge: [number, number][] = [[cx - half, cy - half], [cx + half, cy - half]];

  const ctx: GenerativeContext = {
    namedRegions: {},
    streets: {},
    districtBoundaries: {},
    clusterCentroids: {},
    waterEdge: southEdge,
    realBoundaryNodes,
  };

  const ops: GenerativeOp[] = [
    { op: "LayStreets", district: "sample", pattern: "grid", blockSizeM: 80, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true },
    { op: "FillBlocks", district: "sample", program: "residential", target: { population: 8000 }, heightEnvelope: { minStoreys: 4, maxStoreys: 28 }, coverage: 0.45 },
    { op: "ApplyGradient", district: "sample", field: "height", anchor: "waterEdge", falloffM: 280, falloffShape: "smooth", direction: "down" },
  ].map((o) => GenerativeOpSchema.parse(o));

  const district: GeneratedDistrict = {
    id: "sample",
    seed: 20260625,
    region: { kind: "rect", center: [cx, cy], halfExtents: [half, half], rotationRad: 0 },
    ops,
    clearedClusterIds: [],
  };

  const opts = { metresPerStorey: model.sources.metresPerStorey, snapRadiusM: 60 };
  const a = expandDistrict(district, ctx, opts);
  const b = expandDistrict(district, ctx, opts);

  const deterministic = geometrySignature(a) === geometrySignature(b);
  const fill = a.fillResults[0];

  console.log("[verify:generate] sample district over the real network");
  console.log(`  boundary nodes considered: ${realBoundaryNodes.length}`);
  console.log(`  blocks ${a.blocks.length}, open space ${a.openSpace.length}, lots ${a.lots.length}, buildings ${a.massing.length}`);
  if (fill) {
    console.log(`  units: requested ${fill.requestedUnits}, achieved ${fill.achievedUnits}, shortfall ${fill.shortfall}, met ${fill.metTarget}`);
  }
  console.log(`  stitch gate: connected ${a.gate.connected} (components ${a.gate.components}, stranded ${a.gate.strandedNodeIds.length})`);
  console.log(`  determinism (V8 run-to-run): ${deterministic ? "PASS" : "FAIL"} (JavaScriptCore unverified, see ADR-R23)`);
  if (!a.gate.connected) {
    console.log("  note: gate not connected; widen snapRadiusM or place the district over denser streets");
  }

  const outDir = process.env.CLAUDE_JOB_DIR
    ? path.join(process.env.CLAUDE_JOB_DIR, "tmp")
    : os.tmpdir();
  const outPath = path.join(outDir, "generate-sample.geojson");
  fs.writeFileSync(outPath, JSON.stringify(toGeoJSON(a), null, 2));
  console.log(`  GeoJSON (ENU metres, not lon/lat): ${outPath}`);
}

function toGeoJSON(d: ReturnType<typeof expandDistrict>) {
  const features: unknown[] = [];
  for (const s of d.streets) {
    features.push({ type: "Feature", properties: { kind: "street" }, geometry: { type: "LineString", coordinates: s } });
  }
  for (const m of d.massing) {
    features.push({
      type: "Feature",
      properties: { kind: "building", storeys: m.storeys, height: m.height, template: m.template },
      geometry: { type: "Polygon", coordinates: [[...m.footprint, m.footprint[0]]] },
    });
  }
  for (const b of d.openSpace) {
    features.push({ type: "Feature", properties: { kind: "open-space" }, geometry: { type: "Polygon", coordinates: [[...b.ring, b.ring[0]]] } });
  }
  return { type: "FeatureCollection", features };
}

void main();
