import * as fs from "fs";
import * as path from "path";
import { loadCityModel } from "../src/model/loadCityModel";
import { lonLatToEnu } from "../src/coords/enu";
import type { CityModel, ClusterIndexEntry } from "../src/model/types";

// Known heights ground-truth shape.
type TowerEntry = {
  name: string;
  lonlat: [number, number];
  documentedHeight_m: number;
  mode: "match" | "known_discrepancy";
  note?: string;
};

type KnownHeights = {
  tolerance_m_default: number;
  towers: TowerEntry[];
};

// ---------------------------------------------------------------------------
// Point-in-polygon: ray-cast on the outer ring.
// ---------------------------------------------------------------------------

function pointInRing(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Distance from point to nearest vertex of ring (used for nearest-cluster fallback).
function minDistToRing(px: number, py: number, ring: number[][]): number {
  let best = Infinity;
  for (const pt of ring) {
    const d = Math.hypot(pt[0] - px, pt[1] - py);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Find the cluster closest to a given ENU point.
// Returns { entry, minDist } where minDist is 0 if the point is inside any member footprint.
// ---------------------------------------------------------------------------

function findCluster(
  ex: number,
  ey: number,
  model: CityModel
): { entry: ClusterIndexEntry; minDist: number } | null {
  const buildingById = new Map(model.buildings.map((b) => [b.id, b]));
  let bestEntry: ClusterIndexEntry | null = null;
  let bestDist = Infinity;

  for (const entry of Object.values(model.clusters)) {
    for (const mid of entry.memberIds) {
      const b = buildingById.get(mid);
      if (!b) continue;
      if (b.footprint.length === 0) continue;
      const outerRing = b.footprint[0];
      if (pointInRing(ex, ey, outerRing)) {
        return { entry, minDist: 0 };
      }
      const d = minDistToRing(ex, ey, outerRing);
      if (d < bestDist) {
        bestDist = d;
        bestEntry = entry;
      }
    }
  }

  return bestEntry ? { entry: bestEntry, minDist: bestDist } : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const geojsonPath = path.join(root, "data", "stlawrence.geojson");
  const sourcesPath = path.join(root, "data", "sources.json");
  const knownPath = path.join(root, "data", "known-heights.json");

  console.log("Loading city model...");
  const model = await loadCityModel(geojsonPath, sourcesPath);
  const { originLatLon, coverage, buildings, clusters } = model;
  const [lon0, lat0] = originLatLon;

  console.log(`  ${buildings.length} buildings, ${Object.keys(clusters).length} clusters`);
  console.log(`  Coverage: ${JSON.stringify(coverage)}`);

  const known: KnownHeights = JSON.parse(fs.readFileSync(knownPath, "utf8"));
  const { tolerance_m_default, towers } = known;

  // Over-merge guard: assert no cluster contains more than one match-mode tower.
  const matchCoords = towers
    .filter((t) => t.mode === "match")
    .map((t) => {
      const [ex, ey] = lonLatToEnu(t.lonlat[0], t.lonlat[1], lon0, lat0);
      return { tower: t, ex, ey };
    });

  const clusterHits = new Map<string, string[]>();
  for (const { tower, ex, ey } of matchCoords) {
    const found = findCluster(ex, ey, model);
    if (found) {
      const cid = found.entry.clusterId;
      const list = clusterHits.get(cid) ?? [];
      list.push(tower.name);
      clusterHits.set(cid, list);
    }
  }
  let overMerge = false;
  for (const [cid, names] of clusterHits.entries()) {
    if (names.length > 1) {
      console.error(`FAIL over-merge: cluster ${cid} contains ${names.join(", ")}`);
      overMerge = true;
    }
  }

  // Per-tower checks.
  const header = `${"Tower".padEnd(38)} ${"Documented".padStart(11)} ${"Observed".padStart(9)} ${"Delta".padStart(7)} ${"Src".padStart(12)} ${"sigma".padStart(7)}  Result`;
  console.log("\n" + header);
  console.log("-".repeat(header.length));

  let allMatchPass = true;

  for (const tower of towers) {
    const [ex, ey] = lonLatToEnu(tower.lonlat[0], tower.lonlat[1], lon0, lat0);
    const found = findCluster(ex, ey, model);

    if (!found) {
      console.log(`${"  " + tower.name.padEnd(36)} NO CLUSTER FOUND`);
      if (tower.mode === "match") allMatchPass = false;
      continue;
    }

    const { entry } = found;
    const observed = entry.representativeHeight_m;
    const delta = observed - tower.documentedHeight_m;
    const deltaAbs = Math.abs(delta);

    // Retrieve the tallest member's confidence for reporting.
    const tallest = model.buildings.find((b) => b.id === entry.tallestMemberId);
    const conf = tallest?.height.confidence;
    const srcKind = conf ? conf.kind : "?";
    const sigma = conf && conf.kind !== "hypothetical" ? conf.sigma_m.toFixed(1) : "n/a";

    if (tower.mode === "match") {
      const pass = deltaAbs <= tolerance_m_default;
      if (!pass) allMatchPass = false;
      console.log(
        `  ${tower.name.padEnd(36)} ${tower.documentedHeight_m.toFixed(1).padStart(10)} ${observed.toFixed(1).padStart(9)} ${(delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(5)} ${srcKind.padStart(12)} ${sigma.padStart(7)}  ${pass ? "PASS" : "FAIL"}`
      );
    } else {
      // known_discrepancy: assert wide band.
      const wideEnough = conf && conf.kind !== "hypothetical" && conf.sigma_m >= 3.0;
      console.log(
        `  ${tower.name.padEnd(36)} ${tower.documentedHeight_m.toFixed(1).padStart(10)} ${observed.toFixed(1).padStart(9)} ${(delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(5)} ${srcKind.padStart(12)} ${sigma.padStart(7)}  DISCREPANCY (sigma ${wideEnough ? "OK" : "TOO NARROW"})`
      );
      if (!wideEnough) {
        console.error(
          `  WARN: ${tower.name} known_discrepancy but sigma is too narrow (${sigma}); band may be falsely precise`
        );
      }
    }
  }

  console.log("");
  if (overMerge) {
    console.error("GATE FAILED: over-merge detected");
    process.exit(1);
  }
  if (!allMatchPass) {
    console.error("GATE FAILED: one or more match-mode towers outside tolerance");
    process.exit(1);
  }
  console.log("GATE PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
