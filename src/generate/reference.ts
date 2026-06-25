import { z } from "zod";

// The reference grammar: how a generative op (src/generate/op.ts) names real ground without ever
// emitting a coordinate. The agent references regions, anchors, and axes; the resolvers below turn
// a reference into concrete ENU geometry against a context. In G0 the context is a fixture; G1
// wires it to the real data and the live overlay. Pure and THREE-free, unit-tested in node.
// All coordinates are ENU [east, north] metres, the city's frame.

// ─── Schemas ──────────────────────────────────────────────────────────────────

const Vec2 = z.tuple([z.number(), z.number()]);

// A region of real ground: an oriented rectangle, an explicit polygon, or a named handle the
// agent was given in its context.
export const RegionRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rect"),
    center: Vec2,
    halfExtents: z.tuple([z.number().positive(), z.number().positive()]),
    rotationRad: z.number().default(0),
  }),
  z.object({
    kind: z.literal("polygon"),
    ring: z.array(Vec2).min(3),
  }),
  z.object({
    kind: z.literal("named"),
    id: z.string().min(1),
  }),
]);

// A real feature the agent orients to. Two are keywords (the water, the park); two are named.
export const AnchorRefSchema = z.union([
  z.literal("waterEdge"),
  z.literal("parkCentroid"),
  z.object({ kind: z.literal("street"), name: z.string().min(1) }),
  z.object({ kind: z.literal("districtBoundary"), district: z.string().min(1) }),
]);

// A direction: parallel to an anchor (the grid follows the water), or an explicit bearing.
export const AxisRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("parallelTo"), anchor: AnchorRefSchema }),
  z.object({ kind: z.literal("bearing"), deg: z.number().min(0).max(360) }),
]);

export type RegionRef = z.infer<typeof RegionRefSchema>;
export type AnchorRef = z.infer<typeof AnchorRefSchema>;
export type AxisRef = z.infer<typeof AxisRefSchema>;

// ─── Resolution context and resolved forms ─────────────────────────────────────

export type ResolvedRegion = {
  ring: [number, number][]; // ENU outer ring, open (the resolvers do not repeat the first point)
  center: [number, number];
};

export type ResolvedAnchor =
  | { kind: "point"; point: [number, number] }
  | { kind: "polyline"; points: [number, number][] }
  | { kind: "ring"; ring: [number, number][] };

// The fixtures a reference resolves against. G1 fills these from the real data and the overlay.
export type RefContext = {
  namedRegions: Record<string, ResolvedRegion>;
  waterEdge?: [number, number][]; // polyline
  parkCentroid?: [number, number]; // point
  streets: Record<string, [number, number][]>; // name -> polyline
  districtBoundaries: Record<string, [number, number][]>; // district id -> ring
};

export class ReferenceResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceResolveError";
  }
}

// ─── Resolvers ──────────────────────────────────────────────────────────────────

export function resolveRegion(ref: RegionRef, ctx: RefContext): ResolvedRegion {
  if (ref.kind === "rect") {
    const [cx, cy] = ref.center;
    const [hx, hy] = ref.halfExtents;
    const cos = Math.cos(ref.rotationRad);
    const sin = Math.sin(ref.rotationRad);
    const corner = (lx: number, ly: number): [number, number] => [
      cx + lx * cos - ly * sin,
      cy + lx * sin + ly * cos,
    ];
    return {
      ring: [corner(-hx, -hy), corner(hx, -hy), corner(hx, hy), corner(-hx, hy)],
      center: [cx, cy],
    };
  }
  if (ref.kind === "polygon") {
    return { ring: ref.ring.slice(), center: ringCentroid(ref.ring) };
  }
  const named = ctx.namedRegions[ref.id];
  if (!named) throw new ReferenceResolveError(`unknown named region "${ref.id}"`);
  return named;
}

export function resolveAnchor(ref: AnchorRef, ctx: RefContext): ResolvedAnchor {
  if (ref === "waterEdge") {
    if (!ctx.waterEdge) throw new ReferenceResolveError("context has no waterEdge anchor");
    return { kind: "polyline", points: ctx.waterEdge };
  }
  if (ref === "parkCentroid") {
    if (!ctx.parkCentroid) throw new ReferenceResolveError("context has no parkCentroid anchor");
    return { kind: "point", point: ctx.parkCentroid };
  }
  if (ref.kind === "street") {
    const s = ctx.streets[ref.name];
    if (!s) throw new ReferenceResolveError(`unknown street "${ref.name}"`);
    return { kind: "polyline", points: s };
  }
  const ring = ctx.districtBoundaries[ref.district];
  if (!ring) throw new ReferenceResolveError(`unknown district boundary "${ref.district}"`);
  return { kind: "ring", ring };
}

// A bearing in radians. parallelTo derives it from the anchor's endpoints; a point anchor has no
// direction, which is a loud error rather than a silent default. G1 may refine the principal
// direction (PCA over the polyline); the endpoint vector is the deterministic G0 form.
export function resolveAxis(ref: AxisRef, ctx: RefContext): number {
  if (ref.kind === "bearing") return (ref.deg * Math.PI) / 180;
  const a = resolveAnchor(ref.anchor, ctx);
  if (a.kind === "point") {
    throw new ReferenceResolveError("cannot derive an axis parallel to a point anchor");
  }
  const pts = a.kind === "polyline" ? a.points : a.ring;
  if (pts.length < 2) {
    throw new ReferenceResolveError("anchor has too few points to derive an axis");
  }
  const [e0, n0] = pts[0];
  const [e1, n1] = pts[pts.length - 1];
  return Math.atan2(n1 - n0, e1 - e0);
}

// ─── Geometry helpers ───────────────────────────────────────────────────────────

// Whether an ENU point falls inside an outer ring (open or closed), by ray cast.
export function pointInRing(ring: [number, number][], e: number, n: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > n !== yj > n && e < ((xj - xi) * (n - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function ringCentroid(ring: [number, number][]): [number, number] {
  let e = 0;
  let n = 0;
  for (const [x, y] of ring) {
    e += x;
    n += y;
  }
  return [e / ring.length, n / ring.length];
}
