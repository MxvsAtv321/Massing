import {
  resolveAnchor,
  type AnchorRef,
  type RefContext,
  type ResolvedAnchor,
} from "./reference";

// The ApplyGradient field (ADR-R17, ADR-R20): a normalized factor in [0, 1] by distance from a real
// anchor, the math behind "towers stepping down to the water" and "denser near the water". The
// smoothstep is the pure polynomial 3t^2 - 2t^3 (multiply and add only), and distance uses Math.sqrt,
// which is IEEE 754 correctly-rounded and so bit-identical across engines. No sin, cos, or pow ever
// enters the field, so it cannot diverge node-to-browser (the determinism gate, ADR-R23): the
// transcendental trap the agent rightly fears is kept out of the hot path by construction.

export type GradientField = {
  anchor: ResolvedAnchor;
  falloffM: number;
  shape: "linear" | "smooth";
  direction: "down" | "up"; // how the field value changes moving TOWARD the anchor
};

export function buildGradientField(
  anchorRef: AnchorRef,
  falloffM: number,
  shape: "linear" | "smooth",
  direction: "down" | "up",
  ctx: RefContext
): GradientField {
  return { anchor: resolveAnchor(anchorRef, ctx), falloffM, shape, direction };
}

// The factor at an ENU point, 0..1. direction "down" is low at the anchor, so a height field built on
// it is short at the water and tall away (towers stepping down to the water). "up" is high at the
// anchor (denser/taller near the water).
export function sampleGradient(field: GradientField, e: number, n: number): number {
  const d = distanceToAnchor(field.anchor, e, n);
  let t = d / field.falloffM;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const shaped = field.shape === "smooth" ? t * t * (3 - 2 * t) : t;
  return field.direction === "down" ? shaped : 1 - shaped;
}

// Shortest distance from an ENU point to the anchor geometry. Point, polyline, or ring; sqrt only.
export function distanceToAnchor(a: ResolvedAnchor, e: number, n: number): number {
  if (a.kind === "point") return dist(e, n, a.point[0], a.point[1]);
  const pts = a.kind === "polyline" ? a.points : a.ring;
  const segs = a.kind === "ring" ? pts.length : pts.length - 1;
  let best = Infinity;
  for (let i = 0; i < segs; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const d = pointToSegment(e, n, p[0], p[1], q[0], q[1]);
    if (d < best) best = d;
  }
  return best;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return dist(px, py, ax + t * vx, ay + t * vy);
}
