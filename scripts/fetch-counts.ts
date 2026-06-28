import * as fs from "fs";
import * as path from "path";
import type { CountsFile, CountStationRaw, CountsManifest } from "../src/traffic/validation";

// Acquisition script for real Toronto midblock traffic counts. Run by a developer to
// refresh the baked snapshot (data/traffic-counts.json); the app never fetches at build or
// runtime. Counts are real measured open data and must never be fabricated.
//
//   pnpm fetch:counts

const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const RESOURCE_ID = "e90038e7-ccb9-4bd2-af3e-696adc904c18"; // svc_most_recent_summary_data
const DATASET = "Traffic Volumes - Midblock Vehicle Speed, Volume and Classification Counts";
const DATASET_URL =
  "https://open.toronto.ca/dataset/traffic-volumes-midblock-vehicle-speed-volume-and-classification-counts/";

// Same catchment as the network.
const BBOX = { south: 43.64, west: -79.385, north: 43.654, east: -79.365 };

type Rec = {
  latest_count_id?: number | string;
  latest_count_type?: string;
  latest_count_date_start?: string;
  location_name?: string;
  longitude?: number;
  latitude?: number;
  avg_wkdy_pm_peak_vol?: number | null;
  avg_wkdy_am_peak_vol?: number | null;
  avg_speed?: number | null;
};

async function fetchAll(): Promise<Rec[]> {
  const out: Rec[] = [];
  const pageSize = 10000;
  let offset = 0;
  for (;;) {
    const url =
      `${CKAN}/datastore_search?resource_id=${RESOURCE_ID}` +
      `&limit=${pageSize}&offset=${offset}` +
      `&fields=latest_count_id,latest_count_type,latest_count_date_start,location_name,longitude,latitude,avg_wkdy_pm_peak_vol,avg_wkdy_am_peak_vol,avg_speed`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`CKAN returned ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { result: { records: Rec[] } };
    const recs = data.result.records;
    out.push(...recs);
    if (recs.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

function inBbox(lon: number, lat: number): boolean {
  return lat >= BBOX.south && lat <= BBOX.north && lon >= BBOX.west && lon <= BBOX.east;
}

async function main(): Promise<void> {
  console.log("Fetching Toronto midblock counts from CKAN...");
  const all = await fetchAll();
  console.log(`  ${all.length} records citywide`);

  const stations: CountStationRaw[] = [];
  for (const r of all) {
    if (typeof r.longitude !== "number" || typeof r.latitude !== "number") continue;
    if (!inBbox(r.longitude, r.latitude)) continue;
    const pm = typeof r.avg_wkdy_pm_peak_vol === "number" ? r.avg_wkdy_pm_peak_vol : null;
    const am = typeof r.avg_wkdy_am_peak_vol === "number" ? r.avg_wkdy_am_peak_vol : null;
    if ((pm == null || pm <= 0) && (am == null || am <= 0)) continue;
    stations.push({
      id: String(r.latest_count_id ?? `${r.longitude},${r.latitude}`),
      name: r.location_name ?? "(unnamed)",
      lonlat: [r.longitude, r.latitude],
      pmPeakVol: pm,
      amPeakVol: am,
      avgSpeedKph: typeof r.avg_speed === "number" ? r.avg_speed : null,
      countDate: r.latest_count_date_start ?? "",
      countType: r.latest_count_type ?? "",
    });
  }

  const provenance: CountsManifest = {
    source: "City of Toronto Open Data",
    dataset: DATASET,
    resourceId: RESOURCE_ID,
    datasetUrl: DATASET_URL,
    license: "Open Government Licence - Toronto",
    api: "CKAN datastore_search",
    retrievedDate: new Date().toISOString().slice(0, 10),
    bbox: BBOX,
    note:
      "Measured weekday peak-hour midblock volumes (avg_wkdy_pm_peak_vol, both directions), " +
      "the most recent count per location. Count dates span multiple years; each station " +
      "carries its own countDate.",
  };

  const file: CountsFile = { provenance, stations };
  const outPath = path.resolve(__dirname, "..", "data", "cities", "toronto", "traffic-counts.json");
  fs.writeFileSync(outPath, JSON.stringify(file, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`  ${stations.length} count stations in the catchment`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
