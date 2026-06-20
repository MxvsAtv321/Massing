import * as THREE from "three";
import type { RoadClass } from "../network/types";
import type { RoutableEdge } from "../traffic/routableGraph";
import type { FlowResult } from "../traffic/assignment";

// Congestion-colored ribbons for the flow overlay. Hue encodes the mid v/c (free to
// jammed); edges are faded toward grey where the band is wide, so low-confidence links
// look uncertain. Vertex-colored so one merged mesh recolors when flow changes.
//
// Axis mapping matches buildings.ts / roadGeometry.ts: ENU east -> +X, north -> -Z.

const FLOW_Y = 0.28; // just above the grey road ribbons (0.12)

const HALF_WIDTH: Record<RoadClass, number> = {
  motorway: 8,
  trunk: 7,
  primary: 6,
  secondary: 5.5,
  tertiary: 5,
  residential: 3.5,
  living_street: 3,
  unclassified: 3.5,
};

type RGB = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Green (free) -> amber -> red-orange (at capacity) -> deep red (oversaturated).
const STOPS: [number, RGB][] = [
  [0.0, [0.27, 0.62, 0.38]],
  [0.7, [0.85, 0.65, 0.25]],
  [1.0, [0.83, 0.31, 0.16]],
  [1.6, [0.62, 0.12, 0.1]],
];

export function congestionColor(vc: number): RGB {
  const x = Math.max(0, Math.min(STOPS[STOPS.length - 1][0], vc));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [x0, c0] = STOPS[i - 1];
      const [x1, c1] = STOPS[i];
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// Wash toward neutral grey as the relative band widens, capped so hue stays readable.
export function fadeColor(rgb: RGB, bandWidthRel: number): RGB {
  const f = Math.min(0.6, Math.max(0, bandWidthRel) * 1.1);
  const grey = 0.5;
  return [lerp(rgb[0], grey, f), lerp(rgb[1], grey, f), lerp(rgb[2], grey, f)];
}

export type FlowSegment = {
  polyline: [number, number][];
  roadClass: RoadClass;
  vc: number;
  bandWidthRel: number;
};

function osmWayIdOf(edgeId: string): string {
  const i = edgeId.indexOf(":");
  return i >= 0 ? edgeId.slice(0, i) : edgeId;
}

// Collapse the two opposing directed edges of a street into one drawn segment, colored by
// the worse (max) congestion and the wider band of the pair.
export function groupSegments(edges: RoutableEdge[], flow: FlowResult): FlowSegment[] {
  const byKey = new Map<string, FlowSegment>();
  for (const e of edges) {
    const ef = flow.perEdge.get(e.id);
    if (!ef) continue;
    const lo = e.from < e.to ? e.from : e.to;
    const hi = e.from < e.to ? e.to : e.from;
    const key = `${osmWayIdOf(e.id)}:${lo}-${hi}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.vc = Math.max(existing.vc, ef.vcMid);
      existing.bandWidthRel = Math.max(existing.bandWidthRel, ef.bandWidthRel);
    } else {
      byKey.set(key, {
        polyline: e.geometry,
        roadClass: e.roadClass,
        vc: ef.vcMid,
        bandWidthRel: ef.bandWidthRel,
      });
    }
  }
  return [...byKey.values()];
}

// Build one ribbon (positions + per-vertex color) for a polyline, offsetting each vertex
// along the averaged perpendicular of its adjacent segments to keep the ribbon continuous.
function ribbon(seg: FlowSegment, out: { pos: number[]; col: number[] }): void {
  const pts = seg.polyline;
  if (pts.length < 2) return;
  const hw = HALF_WIDTH[seg.roadClass];
  const color = fadeColor(congestionColor(seg.vc), seg.bandWidthRel);

  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const [x, y] = pts[i];
    left.push([x + nx * hw, y + ny * hw]);
    right.push([x - nx * hw, y - ny * hw]);
  }

  const push = (p: [number, number]) => {
    out.pos.push(p[0], FLOW_Y, -p[1]);
    out.col.push(color[0], color[1], color[2]);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    push(left[i]);
    push(right[i]);
    push(right[i + 1]);
    push(left[i]);
    push(right[i + 1]);
    push(left[i + 1]);
  }
}

export function buildFlowRibbons(segments: FlowSegment[]): THREE.BufferGeometry | null {
  const out = { pos: [] as number[], col: [] as number[] };
  for (const s of segments) ribbon(s, out);
  if (out.pos.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(out.col, 3));
  return geo;
}
