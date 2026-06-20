import { lonLatToEnu } from "../coords/enu";
import type { RoutableEdge } from "./routableGraph";
import type { FlowResult } from "./assignment";

// Validation of simulated flow against real measured Toronto midblock counts. Counts are a
// factual readout (real open data); the fit is reported honestly and is scenario-conditional
// (ADR-010). Pure, no I/O.

// ---------------------------------------------------------------------------
// Baked count data (data/traffic-counts.json)
// ---------------------------------------------------------------------------

export type CountsManifest = {
  source: string;
  dataset: string;
  resourceId: string;
  datasetUrl: string;
  license: string;
  api: string;
  retrievedDate: string;
  bbox: { south: number; west: number; north: number; east: number };
  note: string;
};

export type CountStationRaw = {
  id: string;
  name: string;
  lonlat: [number, number];
  pmPeakVol: number | null; // measured weekday PM peak-hour volume (both directions)
  amPeakVol: number | null;
  avgSpeedKph: number | null;
  countDate: string;
  countType: string;
};

export type CountsFile = { provenance: CountsManifest; stations: CountStationRaw[] };

// A station reprojected into the shared ENU frame, with a single measured volume.
export type CountStation = {
  id: string;
  name: string;
  enu: [number, number];
  measuredVol: number; // PM peak preferred, AM peak fallback
  avgSpeedKph: number | null;
  countDate: string;
};

export function toEnuStations(file: CountsFile, originLatLon: [number, number]): CountStation[] {
  const [lon0, lat0] = originLatLon;
  const out: CountStation[] = [];
  for (const s of file.stations) {
    const measured = s.pmPeakVol ?? s.amPeakVol;
    if (measured == null || measured <= 0) continue;
    out.push({
      id: s.id,
      name: s.name,
      enu: lonLatToEnu(s.lonlat[0], s.lonlat[1], lon0, lat0),
      measuredVol: measured,
      avgSpeedKph: s.avgSpeedKph,
      countDate: s.countDate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry: distance from a point to a polyline (ENU)
// ---------------------------------------------------------------------------

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function pointToPolylineDist(p: [number, number], poly: [number, number][]): number {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) return Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]);
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const d = pointToSegmentDist(p[0], p[1], poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Matching: nearest network segment to each count station
// ---------------------------------------------------------------------------

function osmWayIdOf(edgeId: string): string {
  const i = edgeId.indexOf(":");
  return i >= 0 ? edgeId.slice(0, i) : edgeId;
}

function segmentKeyOf(edge: RoutableEdge): string {
  const lo = edge.from < edge.to ? edge.from : edge.to;
  const hi = edge.from < edge.to ? edge.to : edge.from;
  return `${osmWayIdOf(edge.id)}:${lo}-${hi}`;
}

export type CountMatch = {
  station: CountStation;
  segmentKey: string;
  edgeIds: string[]; // all directed edges of the matched segment (the cross-section)
  distMetres: number;
};

export function matchCountsToEdges(
  stations: CountStation[],
  edges: RoutableEdge[],
  maxDistMetres: number
): { matches: CountMatch[]; unmatched: CountStation[] } {
  // Index directed edges by segment key.
  const segEdges = new Map<string, string[]>();
  for (const e of edges) {
    const key = segmentKeyOf(e);
    const list = segEdges.get(key);
    if (list) list.push(e.id);
    else segEdges.set(key, [e.id]);
  }

  const matches: CountMatch[] = [];
  const unmatched: CountStation[] = [];

  for (const st of stations) {
    let bestDist = Infinity;
    let bestEdge: RoutableEdge | null = null;
    for (const e of edges) {
      const d = pointToPolylineDist(st.enu, e.geometry);
      if (d < bestDist) {
        bestDist = d;
        bestEdge = e;
      }
    }
    if (bestEdge && bestDist <= maxDistMetres) {
      const key = segmentKeyOf(bestEdge);
      matches.push({ station: st, segmentKey: key, edgeIds: segEdges.get(key) ?? [bestEdge.id], distMetres: bestDist });
    } else {
      unmatched.push(st);
    }
  }

  return { matches, unmatched };
}

// ---------------------------------------------------------------------------
// GEH statistic and the fit
// ---------------------------------------------------------------------------

// GEH = sqrt(2 (M - C)^2 / (M + C)). The transport-modeling standard: GEH < 5 is a good
// match, < 10 acceptable. Zero when modeled equals counted.
export function gehStatistic(modeled: number, counted: number): number {
  const denom = modeled + counted;
  if (denom <= 0) return 0;
  return Math.sqrt((2 * (modeled - counted) ** 2) / denom);
}

export type StationFit = {
  id: string;
  name: string;
  measured: number;
  simulated: number;
  geh: number;
  distMetres: number;
};

export type ValidationResult = {
  perStation: StationFit[];
  nMatched: number;
  nStations: number;
  medianGeh: number;
  pctUnder5: number;
  pctUnder10: number;
};

export function validateFlow(
  matches: CountMatch[],
  flow: FlowResult,
  nStations: number
): ValidationResult {
  const perStation: StationFit[] = matches.map((m) => {
    let simulated = 0;
    for (const id of m.edgeIds) {
      const ef = flow.perEdge.get(id);
      if (ef) simulated += ef.volumeMid;
    }
    return {
      id: m.station.id,
      name: m.station.name,
      measured: m.station.measuredVol,
      simulated,
      geh: gehStatistic(simulated, m.station.measuredVol),
      distMetres: m.distMetres,
    };
  });

  const sorted = perStation.map((s) => s.geh).sort((a, b) => a - b);
  const n = sorted.length;
  const medianGeh =
    n === 0 ? 0 : n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const under5 = perStation.filter((s) => s.geh < 5).length;
  const under10 = perStation.filter((s) => s.geh < 10).length;

  return {
    perStation,
    nMatched: n,
    nStations,
    medianGeh,
    pctUnder5: n ? (under5 / n) * 100 : 0,
    pctUnder10: n ? (under10 / n) * 100 : 0,
  };
}
