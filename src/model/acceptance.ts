import { Observer, Equator, Horizon, Body, SearchHourAngle } from "astronomy-engine";
import { analyzeConnectivity } from "../network/connectivity";
import { enuToLonLat, haversineLengthLonLat } from "../network/geometry";
import type { CityModel } from "./types";
import type { RoadNetwork } from "../network/types";

// The automatic structural acceptance gate (I2, ADR-R25). It accepts or rejects an ingested city on
// structure and universal physics alone, with no hand-verified ground truth, which is what unattended
// onboarding requires. Three parts, matching the trichotomy:
//
//   geometry  footprint sanity plus the ENU-vs-geodesic length cross-check on the road graph. The
//             cross-check recomputes geodesic length from the ENU geometry with no external truth, so
//             it catches the one projection error the spine forbids (Web Mercator metres without the
//             cos(lat0) factor inflate length ~1.38x at Toronto's latitude). Correct framing here is
//             also the sun-soundness gate: the solar engine is universal, so right coordinates mean
//             right shadows.
//   network   structural soundness, the reach and traffic gate: a single strongly-connected component
//             after prune, a dominant fraction above a floor, and no zero-length or absurd edges.
//   solar     a per-city identity check that makes the sun claim concrete: at the city's latitude the
//             equinox solar-noon altitude must equal 90 - |lat| within tolerance.
//
// A pass here is NOT a correctness certificate. Heights are unverified and labeled, not gated (ADR-R26);
// this certifies that the geometry is sound and the framing is right, never that the data is true.

const DOMINANCE_FAIL = 0.5; // below this the "dominant" component is a minority: broken ingestion
const DOMINANCE_FULL = 0.8; // at or above this the catchment is whole; between is partial (label it)
const LENGTH_REL_TOL = 0.005; // 0.5%, the same bound verify-network uses
const ABSURD_EDGE_M = 1500; // a single drivable segment longer than this is suspicious
const SOLAR_TOL_DEG = 1.5; // covers refraction and the equinox not landing exactly at decl 0
const EQUINOX_UTC = "2026-03-20T12:00:00Z";

export type GeometryReport = {
  ok: boolean;
  footprints: number;
  degenerateRings: number;
  checkedEdges: number;
  worstLengthRelError: number;
};

export type NetworkReport = {
  ok: boolean;
  components: number;
  dominanceFrac: number;
  coverage: "full" | "partial"; // partial seeds the I3 reach-scoping label
  strandedNodes: number;
  zeroLengthEdges: number;
  absurdEdges: number;
};

export type SolarReport = {
  ok: boolean;
  latitude: number;
  noonAltitudeDeg: number;
  analyticAltitudeDeg: number;
};

export type StructuralReport = {
  ok: boolean;
  cityId: string;
  geometry: GeometryReport;
  network: NetworkReport;
  solar: SolarReport;
  reasons: string[];
};

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a) / 2;
}

export function geometryAcceptance(model: CityModel, network: RoadNetwork): GeometryReport {
  let degenerate = 0;
  for (const b of model.buildings) {
    const outer = b.footprint[0];
    if (!outer || outer.length < 4) {
      degenerate++;
      continue;
    }
    let finite = true;
    for (const [x, y] of outer) if (!Number.isFinite(x) || !Number.isFinite(y)) finite = false;
    if (!finite || ringArea(outer) <= 0) degenerate++;
  }

  // Coordinate framing: ENU planar length vs the geodesic length of the recovered lon/lat. For a
  // correct equirectangular tangent plane these agree to well under 0.5% over a few km.
  const [lon0, lat0] = model.originLatLon;
  let worst = 0;
  let checked = 0;
  for (const e of network.edges) {
    if (!(e.lengthMetres > 0)) continue;
    const lonlat = e.geometry.map(([x, y]) => enuToLonLat(x, y, lon0, lat0));
    const geo = haversineLengthLonLat(lonlat);
    if (!(geo > 0)) continue;
    const rel = Math.abs(e.lengthMetres - geo) / geo;
    if (rel > worst) worst = rel;
    checked++;
  }

  return {
    ok: degenerate === 0 && model.buildings.length > 0 && checked > 0 && worst <= LENGTH_REL_TOL,
    footprints: model.buildings.length,
    degenerateRings: degenerate,
    checkedEdges: checked,
    worstLengthRelError: worst,
  };
}

export function networkAcceptance(network: RoadNetwork): NetworkReport {
  const conn = analyzeConnectivity(network);
  const cov = network.coverage;
  const dominanceFrac =
    cov.graphNodesBeforePrune > 0 ? cov.graphNodes / cov.graphNodesBeforePrune : 0;
  let zero = 0;
  let absurd = 0;
  for (const e of network.edges) {
    if (!(e.lengthMetres > 0)) zero++;
    else if (e.lengthMetres > ABSURD_EDGE_M) absurd++;
  }
  return {
    ok:
      conn.components === 1 &&
      conn.strandedNodeIds.length === 0 &&
      zero === 0 &&
      absurd === 0 &&
      dominanceFrac >= DOMINANCE_FAIL,
    components: conn.components,
    dominanceFrac,
    coverage: dominanceFrac >= DOMINANCE_FULL ? "full" : "partial",
    strandedNodes: conn.strandedNodeIds.length,
    zeroLengthEdges: zero,
    absurdEdges: absurd,
  };
}

export function solarAcceptance(originLatLon: [number, number]): SolarReport {
  const [lon, lat] = originLatLon; // loader convention: [lon, lat]
  const analytic = 90 - Math.abs(lat);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
    return { ok: false, latitude: lat, noonAltitudeDeg: NaN, analyticAltitudeDeg: analytic };
  }
  const obs = new Observer(lat, lon, 0);
  const transit = SearchHourAngle(Body.Sun, obs, 0, new Date(EQUINOX_UTC), 1);
  const eq = Equator(Body.Sun, transit.time.date, obs, true, true);
  const hor = Horizon(transit.time.date, obs, eq.ra, eq.dec, "normal");
  return {
    ok: Number.isFinite(hor.altitude) && Math.abs(hor.altitude - analytic) <= SOLAR_TOL_DEG,
    latitude: lat,
    noonAltitudeDeg: hor.altitude,
    analyticAltitudeDeg: analytic,
  };
}

export function structuralAcceptance(model: CityModel, network: RoadNetwork): StructuralReport {
  const geometry = geometryAcceptance(model, network);
  const net = networkAcceptance(network);
  const solar = solarAcceptance(model.originLatLon);

  const reasons: string[] = [];
  if (geometry.degenerateRings > 0) reasons.push(`${geometry.degenerateRings} degenerate footprint rings`);
  if (geometry.checkedEdges === 0) reasons.push("no road edges to cross-check the coordinate framing");
  if (geometry.worstLengthRelError > LENGTH_REL_TOL)
    reasons.push(
      `coordinate framing off by ${(geometry.worstLengthRelError * 100).toFixed(2)}% (a projection error)`
    );
  if (net.components !== 1) reasons.push(`road graph is ${net.components} components, not a single SCC`);
  if (net.strandedNodes > 0) reasons.push(`${net.strandedNodes} stranded road nodes after prune`);
  if (net.zeroLengthEdges > 0) reasons.push(`${net.zeroLengthEdges} zero-length road edges`);
  if (net.absurdEdges > 0) reasons.push(`${net.absurdEdges} road edges over ${ABSURD_EDGE_M} m`);
  if (net.dominanceFrac < DOMINANCE_FAIL)
    reasons.push(`dominant road component is only ${(net.dominanceFrac * 100).toFixed(0)}% (broken)`);
  if (!solar.ok)
    reasons.push(
      `solar identity off: noon altitude ${solar.noonAltitudeDeg.toFixed(1)} vs analytic ${solar.analyticAltitudeDeg.toFixed(1)}`
    );

  return {
    ok: geometry.ok && net.ok && solar.ok,
    cityId: model.sources.cityId,
    geometry,
    network: net,
    solar,
    reasons,
  };
}
