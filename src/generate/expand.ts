import { splitmix32 } from "./rng";
import {
  resolveRegion,
  resolveAxis,
  pointInRing,
  resolveAnchor,
  type AnchorRef,
} from "./reference";
import { buildGrid } from "./grid";
import { partitionBlocks, type Block } from "./blocks";
import {
  buildDistrictGraph,
  stitch,
  stitchGate,
  type StitchGraph,
  type StitchGate,
} from "./stitch";
import { subdivideBlock, type Lot } from "./lots";
import { buildGradientField, sampleGradient } from "./gradient";
import { massLot, type MassingPlacement } from "./massing";
import { computeFill, requestedUnits, ringArea } from "./fill";
import { pointToSegmentDistSq } from "./placement";
import type { GeneratedDistrict, GenerativeContext, FillResult } from "./types";
import type {
  ApplyGradientOp,
  FillBlocksOp,
  LayStreetsOp,
  PlaceOpenSpaceOp,
} from "./op";

// The top-level expander (ADR-R18): a GeneratedDistrict (ops + seed) plus the resolved context become
// grounded geometry, deterministically. One seeded PRNG drives the whole run; the same ops and seed
// produce the same geometry every time and in any engine, because nothing in the path uses a
// transcendental beyond Math.sqrt (the determinism gate, ADR-R23). This is the same module the agent
// scores server-side and the client renders, so what the agent measures is what the user sees.

export type ExpandOpts = {
  metresPerStorey: number;
  maxLotSizeM?: number; // default 50
  lotJitterFrac?: number; // default 0.2
  snapRadiusM?: number; // default 60
  roadBufferM?: number; // default 10, keep generated buildings this far off real road centerlines
};

export type ExpandedDistrict = {
  id: string;
  seed: number;
  streets: [number, number][][]; // ENU polylines (block-edge centerlines)
  blocks: Block[]; // built blocks (open space excluded)
  openSpace: Block[]; // reserved park/plaza blocks
  lots: Lot[];
  massing: MassingPlacement[];
  graph: StitchGraph;
  gate: StitchGate;
  fillResults: FillResult[];
};

export class ExpandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpandError";
  }
}

const DEFAULT_MAX_LOT = 50;
const DEFAULT_JITTER = 0.2;
const DEFAULT_SNAP = 60;
const DEFAULT_ROAD_BUFFER = 10;

export function expandDistrict(
  district: GeneratedDistrict,
  ctx: GenerativeContext,
  opts: ExpandOpts
): ExpandedDistrict {
  const rng = splitmix32(district.seed);
  const region = resolveRegion(district.region, ctx);

  // Last wins: a re-emitted shaping op (the agent adjusting density or height to converge, G5)
  // replaces the prior one. Single-op cases are unchanged, so this is invisible to G1 to G4.
  const rev = [...district.ops].reverse();
  const lay = rev.find((o): o is LayStreetsOp => o.op === "LayStreets");
  if (!lay) throw new ExpandError(`district "${district.id}" has no LayStreets op`);
  const fillOp = rev.find((o): o is FillBlocksOp => o.op === "FillBlocks");
  const gradOp = rev.find(
    (o): o is ApplyGradientOp => o.op === "ApplyGradient" && o.field === "height"
  );
  const openOp = rev.find((o): o is PlaceOpenSpaceOp => o.op === "PlaceOpenSpace");

  const axisRad = resolveAxis(lay.primaryAxis, ctx);
  const grid = buildGrid(region, axisRad, lay.blockSizeM);
  const allBlocks = partitionBlocks(grid, region);

  const reserved = openOp ? reserveOpenSpace(allBlocks, openOp, region.center, ctx) : new Set<string>();
  const openSpace = allBlocks.filter((b) => reserved.has(b.id));
  const buildBlocks = allBlocks.filter((b) => !reserved.has(b.id));

  const lots: Lot[] = [];
  const massing: MassingPlacement[] = [];
  const fillResults: FillResult[] = [];

  if (fillOp) {
    const maxLot = opts.maxLotSizeM ?? DEFAULT_MAX_LOT;
    const jitter = opts.lotJitterFrac ?? DEFAULT_JITTER;
    const roads = ctx.roadCenterlines ?? [];
    const bufferSq = (opts.roadBufferM ?? DEFAULT_ROAD_BUFFER) ** 2;
    for (const blk of buildBlocks) {
      for (const lot of subdivideBlock(grid, blk, { maxLotSizeM: maxLot, jitterFrac: jitter }, rng)) {
        // Street-aware generation (ADR-R18): drop lots that fall on the real road right-of-way, so
        // the proposal respects the streets running through the region instead of building on them.
        if (roads.length > 0 && minDistSqToRoads(lot.centroid, roads) < bufferSq) continue;
        lots.push(lot);
      }
    }

    const grad = gradOp
      ? buildGradientField(gradOp.anchor, gradOp.falloffM, gradOp.falloffShape, gradOp.direction, ctx)
      : null;
    const { minStoreys, maxStoreys } = fillOp.heightEnvelope;

    for (const lot of lots) {
      let storeys: number;
      if (grad) {
        const f = sampleGradient(grad, lot.centroid[0], lot.centroid[1]);
        storeys = Math.round(minStoreys + f * (maxStoreys - minStoreys));
      } else {
        storeys = maxStoreys; // no gradient: fill to the envelope cap
      }
      if (storeys < minStoreys) storeys = minStoreys;
      else if (storeys > maxStoreys) storeys = maxStoreys;
      massing.push(massLot(lot, storeys, fillOp.coverage, opts.metresPerStorey));
    }

    // Requested from the target; achieved is summed from the actual post-gradient massing inside
    // computeFill, so the shortfall reflects the city that was built, not the envelope max.
    const requested = requestedUnits(fillOp.target, ringArea(region.ring));
    fillResults.push(computeFill(massing, fillOp.program, requested));
  }

  // Streets and the stitched graph span all blocks, so the grid bounds the park too.
  const districtGraph = buildDistrictGraph(allBlocks);
  const streets = uniqueStreets(districtGraph);
  const { graph } = stitch(
    districtGraph,
    ctx.realGraph ?? { nodes: [], edges: [] },
    opts.snapRadiusM ?? DEFAULT_SNAP
  );
  const gate = stitchGate(graph);

  return {
    id: district.id,
    seed: district.seed,
    streets,
    blocks: buildBlocks,
    openSpace,
    lots,
    massing,
    graph,
    gate,
    fillResults,
  };
}

// A stable, human-readable signature of the built geometry, for the determinism check in the verify
// script. Tests compare the full structures for exactness; this is the at-a-glance hash.
export function geometrySignature(d: ExpandedDistrict): string {
  const parts: string[] = [];
  for (const m of [...d.massing].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    parts.push(m.id, String(m.storeys), m.height.toFixed(3), ringStr(m.footprint));
    if (m.podium) parts.push("p", String(m.podium.storeys), ringStr(m.podium.footprint));
  }
  return parts.join(";");
}

function ringStr(r: [number, number][]): string {
  return r.map(([e, n]) => `${e.toFixed(3)},${n.toFixed(3)}`).join("/");
}

// ─── Open space ─────────────────────────────────────────────────────────────────

function reserveOpenSpace(
  blocks: Block[],
  op: PlaceOpenSpaceOp,
  regionCenter: [number, number],
  ctx: GenerativeContext
): Set<string> {
  const where = op.where;
  const reserved = new Set<string>();

  // A region: reserve blocks whose center falls inside it.
  if (typeof where === "object" && (where.kind === "rect" || where.kind === "polygon" || where.kind === "named")) {
    const region = resolveRegion(where, ctx);
    for (const b of blocks) {
      const c = centroidOf(b.ring);
      if (pointInRing(region.ring, c[0], c[1])) reserved.add(b.id);
    }
    return reserved;
  }

  // "central" or an anchor: reserve the nearest blocks to a target point until the area is met. The
  // region members already returned above, so a non-"central" where is an anchor here.
  const target =
    where === "central" ? regionCenter : anchorPoint(where as AnchorRef, ctx, regionCenter);
  const ranked = blocks
    .map((b) => ({ b, d2: d2(centroidOf(b.ring), target) }))
    .sort((x, y) => x.d2 - y.d2 || (x.b.id < y.b.id ? -1 : x.b.id > y.b.id ? 1 : 0));

  let area = 0;
  for (const { b } of ranked) {
    if (area >= op.areaM2) break;
    reserved.add(b.id);
    area += ringArea(b.ring);
  }
  return reserved;
}

function anchorPoint(
  where: AnchorRef,
  ctx: GenerativeContext,
  fallback: [number, number]
): [number, number] {
  const a = resolveAnchor(where, ctx);
  if (a.kind === "point") return a.point;
  const pts = a.kind === "polyline" ? a.points : a.ring;
  if (pts.length === 0) return fallback;
  let e = 0;
  let n = 0;
  for (const [pe, pn] of pts) {
    e += pe;
    n += pn;
  }
  return [e / pts.length, n / pts.length];
}

// ─── Geometry helpers ───────────────────────────────────────────────────────────

function centroidOf(ring: [number, number][]): [number, number] {
  let e = 0;
  let n = 0;
  for (const [pe, pn] of ring) {
    e += pe;
    n += pn;
  }
  return [e / ring.length, n / ring.length];
}

function d2(a: [number, number], b: [number, number]): number {
  const de = a[0] - b[0];
  const dn = a[1] - b[1];
  return de * de + dn * dn;
}

// Squared distance from a point to the nearest real road centerline, for the street-aware mask.
function minDistSqToRoads(p: [number, number], roads: [number, number][][]): number {
  let best = Infinity;
  for (const path of roads) {
    for (let i = 0; i + 1 < path.length; i++) {
      const dd = pointToSegmentDistSq(p, path[i], path[i + 1]);
      if (dd < best) best = dd;
    }
  }
  return best;
}

function uniqueStreets(g: StitchGraph): [number, number][][] {
  const enu = new Map(g.nodes.map((n) => [n.id, n.enu]));
  const seen = new Set<string>();
  const out: [number, number][][] = [];
  for (const e of g.edges) {
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = enu.get(e.from);
    const b = enu.get(e.to);
    if (a && b) out.push([a, b]);
  }
  return out;
}
