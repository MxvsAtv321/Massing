// Solar validation harness. Run via: pnpm verify:solar
// All checks are analytic or derived from NOAA Solar Calculator reference data.
// Exit nonzero if any assertion fails.

import { Observer, Equator, Horizon, Body, SearchHourAngle, SearchRiseSet } from "astronomy-engine";
import * as THREE from "three";
import { sunDirFromAltAz, MIN_SUN_ALTITUDE_DEG } from "../src/solar/sun";

// Toronto observer: same coordinates as the model's originLatLon (approx).
const LAT = 43.6532;
const LON = -79.3832;
const OBS = new Observer(LAT, LON, 76);

let failures = 0;

function assert(condition: boolean, label: string, detail: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}: ${detail}`);
    failures++;
  }
}

function sunAtUtc(d: Date): { altitude: number; azimuth: number; dir: THREE.Vector3 } {
  const eq = Equator(Body.Sun, d, OBS, true, true);
  const hor = Horizon(d, OBS, eq.ra, eq.dec, "normal");
  const { sunDir } = sunDirFromAltAz(hor.altitude, hor.azimuth);
  return { altitude: hor.altitude, azimuth: hor.azimuth, dir: sunDir };
}

// ---------------------------------------------------------------------------
// 1. AXIS CHECK: at solar noon, sun is due south -> az=180 -> sunDir.z > 0
//    Shadow falls in anti-sun horizontal direction (-z = north). Correct.
// ---------------------------------------------------------------------------

console.log("\n1. Axis check (solar noon, June 21 2026)");
{
  // Find solar transit (hour angle = 0) near June 21 2026 noon UTC.
  const startSearch = new Date("2026-06-21T10:00:00Z");
  const transit = SearchHourAngle(Body.Sun, OBS, 0, startSearch, 1);
  const noon = transit.time.date;
  const { altitude, azimuth, dir } = sunAtUtc(noon);
  console.log(`  Solar transit UTC: ${noon.toISOString()}`);
  console.log(`  altitude=${altitude.toFixed(4)} az=${azimuth.toFixed(4)} sunDir=(${dir.x.toFixed(4)}, ${dir.y.toFixed(4)}, ${dir.z.toFixed(4)})`);

  assert(
    Math.abs(azimuth - 180) < 0.1,
    "Solar noon azimuth is ~180 deg",
    `got ${azimuth.toFixed(4)}`
  );
  assert(
    Math.abs(dir.x) < 0.05,
    "sunDir.x near zero at noon (no east/west component)",
    `got ${dir.x.toFixed(4)}`
  );
  // sun is due south -> +Z in Three.js (north=-Z, south=+Z)
  assert(
    dir.z > 0.3,
    "sunDir.z > 0.3 at noon (sun in south hemisphere = positive Three.js Z)",
    `got ${dir.z.toFixed(4)}`
  );
}

// ---------------------------------------------------------------------------
// 2. NOON ALTITUDES vs. analytic expectation (90 - lat +/- 23.44 deg)
//    Using 0.5 deg tolerance for full solstice/equinox checks.
// ---------------------------------------------------------------------------

console.log("\n2. Solar noon altitudes");
{
  const cases: Array<{ label: string; date: string; expected: number; tol: number }> = [
    { label: "Summer solstice  (Jun 21 2026)", date: "2026-06-21T10:00:00Z", expected: 69.8, tol: 0.5 },
    { label: "Vernal equinox   (Mar 20 2026)", date: "2026-03-20T10:00:00Z", expected: 46.3, tol: 0.5 },
    { label: "Winter solstice  (Dec 21 2026)", date: "2026-12-21T10:00:00Z", expected: 22.9, tol: 0.5 },
  ];
  for (const c of cases) {
    const transit = SearchHourAngle(Body.Sun, OBS, 0, new Date(c.date), 1);
    const { altitude } = sunAtUtc(transit.time.date);
    assert(
      Math.abs(altitude - c.expected) < c.tol,
      `${c.label}: altitude ${altitude.toFixed(2)} deg (expected ~${c.expected})`,
      `delta ${(altitude - c.expected).toFixed(3)} deg, tol=${c.tol}`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. NOAA REFERENCE: summer solstice solar noon Toronto.
//    Analytic expected value: 90 - 43.6532 + 23.44 = 69.79 deg.
//    astronomy-engine result is compared against this analytic derivation.
//    Tolerance 0.25 deg (not 0.1) because the analytic formula is an
//    approximation; the engine's own result is more accurate than the formula.
// ---------------------------------------------------------------------------

console.log("\n3. NOAA/analytic reference (summer solstice noon)");
{
  const transit = SearchHourAngle(Body.Sun, OBS, 0, new Date("2026-06-21T10:00:00Z"), 1);
  const { altitude, azimuth } = sunAtUtc(transit.time.date);
  const analyticAlt = 90 - LAT + 23.44; // simple solstice formula
  assert(
    Math.abs(altitude - analyticAlt) < 0.25,
    `Summer noon altitude ${altitude.toFixed(4)} vs analytic ${analyticAlt.toFixed(4)}`,
    `delta ${Math.abs(altitude - analyticAlt).toFixed(4)} deg (tol 0.25)`
  );
  assert(
    Math.abs(azimuth - 180.0) < 0.1,
    `Summer noon azimuth ${azimuth.toFixed(4)} is ~180`,
    `delta ${Math.abs(azimuth - 180).toFixed(4)}`
  );
}

// ---------------------------------------------------------------------------
// 4. EQUINOX DAY LENGTH and sunrise/sunset azimuths.
// ---------------------------------------------------------------------------

console.log("\n4. Equinox day length and rise/set azimuths (Mar 20 2026)");
{
  const start = new Date("2026-03-20T00:00:00Z");
  const rise = SearchRiseSet(Body.Sun, OBS, +1, start, 1);
  const set  = SearchRiseSet(Body.Sun, OBS, -1, start, 1);

  if (!rise || !set) {
    console.error("  FAIL  Could not find equinox sunrise/sunset");
    failures++;
  } else {
    const dayHours = (set.date.getTime() - rise.date.getTime()) / 3_600_000;
    const { azimuth: riseAz } = sunAtUtc(rise.date);
    const { azimuth: setAz }  = sunAtUtc(set.date);

    console.log(`  Sunrise UTC: ${rise.date.toISOString()}  az=${riseAz.toFixed(2)}`);
    console.log(`  Sunset  UTC: ${set.date.toISOString()}   az=${setAz.toFixed(2)}`);
    console.log(`  Day length: ${dayHours.toFixed(2)} h`);

    assert(Math.abs(dayHours - 12) < 0.5, `Equinox day length ${dayHours.toFixed(2)} h (~12 h)`, `delta ${Math.abs(dayHours-12).toFixed(2)}`);
    assert(Math.abs(riseAz -  90) < 2,   `Sunrise azimuth ${riseAz.toFixed(2)} (~90 deg E)`,   `delta ${Math.abs(riseAz- 90).toFixed(2)}`);
    assert(Math.abs(setAz  - 270) < 2,   `Sunset azimuth  ${setAz.toFixed(2)}  (~270 deg W)`,  `delta ${Math.abs(setAz-270).toFixed(2)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. UNIT LENGTH: sunDir is a unit vector for sampled times.
// ---------------------------------------------------------------------------

console.log("\n5. sunDir unit length (10 samples across June 21 2026)");
{
  const base = Date.parse("2026-06-21T12:00:00Z");
  let allPass = true;
  for (let i = 0; i < 10; i++) {
    const d = new Date(base + i * 3_600_000); // hourly
    const { dir } = sunAtUtc(d);
    const len = dir.length();
    if (Math.abs(len - 1) > 1e-10) {
      console.error(`  FAIL  Sample ${i}: length=${len}`);
      failures++;
      allPass = false;
    }
  }
  if (allPass) console.log("  PASS  All 10 samples are unit length");
}

// ---------------------------------------------------------------------------
// 6. isUsable threshold: altitude at MIN_SUN_ALTITUDE_DEG boundary.
// ---------------------------------------------------------------------------

console.log("\n6. isUsable threshold");
{
  const { isUsable: u8 } = sunDirFromAltAz(MIN_SUN_ALTITUDE_DEG, 180);
  const { isUsable: u7 } = sunDirFromAltAz(MIN_SUN_ALTITUDE_DEG - 1, 180);
  const { isUsable: u9 } = sunDirFromAltAz(MIN_SUN_ALTITUDE_DEG + 1, 180);
  assert(u8,  `alt == ${MIN_SUN_ALTITUDE_DEG} is usable (on threshold)`, "");
  assert(!u7, `alt == ${MIN_SUN_ALTITUDE_DEG - 1} is not usable (below threshold)`, "");
  assert(u9,  `alt == ${MIN_SUN_ALTITUDE_DEG + 1} is usable (above threshold)`, "");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("");
if (failures === 0) {
  console.log("SOLAR GATE PASSED");
} else {
  console.error(`SOLAR GATE FAILED: ${failures} check(s) failed`);
  process.exit(1);
}
