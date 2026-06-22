// Procedurally generate a ring of context blocks around the real city slice so
// the neighborhood reads as part of a larger Toronto rather than a model ending
// in mid-air. This fabric is invented, not measured: it is generated here, never
// sourced from data/, and it is rendered low, desaturated, and fog-bound (see
// Context.tsx) so it reads as atmospheric backdrop and never as the grounded
// city. That is how the one line is held here, by register, not a badge.
//
// Pure and deterministic (seeded) so the surrounding skyline is stable across
// renders and testable without a renderer.

export type ContextBlock = {
  cx: number; // ENU east, metres
  cn: number; // ENU north, metres
  width: number; // east-west footprint extent before rotation, metres
  depth: number; // north-south footprint extent before rotation, metres
  height: number; // metres
  rotation: number; // radians about the up axis
};

export type ContextRingOptions = {
  center: [number, number]; // ENU [east, north] city centroid
  innerRadius: number; // annulus starts here, just outside the real footprint
  outerRadius: number; // annulus ends here, where fog has swallowed it
  cellSize?: number; // grid pitch, metres
  fill?: number; // block footprint as a fraction of its cell
  porosity?: number; // fraction of cells dropped as street gaps
  innerHeight?: number; // taper height at the inner edge, metres
  outerHeight?: number; // taper height at the outer edge, metres
  seed?: number;
};

// Lay a regular grid over the bounding square, keep the cells whose centers fall
// in the annulus, and fill each kept cell with a jittered block whose height
// tapers down toward the outer edge so the ring sinks into the haze.
export function buildContextRing(opts: ContextRingOptions): ContextBlock[] {
  const {
    center,
    innerRadius,
    outerRadius,
    cellSize = 110,
    fill = 0.68,
    porosity = 0.28,
    innerHeight = 36,
    outerHeight = 7,
    seed = 1337,
  } = opts;

  const [cx0, cn0] = center;
  const blocks: ContextBlock[] = [];
  const nHalf = Math.ceil(outerRadius / cellSize) + 1;
  const span = Math.max(outerRadius - innerRadius, 1);

  for (let ix = -nHalf; ix <= nHalf; ix++) {
    for (let iy = -nHalf; iy <= nHalf; iy++) {
      const cellE = cx0 + ix * cellSize;
      const cellN = cn0 + iy * cellSize;
      const dist = Math.hypot(cellE - cx0, cellN - cn0);
      if (dist < innerRadius || dist > outerRadius) continue;

      const rng = mulberry32(hashCell(ix, iy, seed));
      if (rng() < porosity) continue; // a gap where a street would run

      const t = clamp((dist - innerRadius) / span, 0, 1);
      const base = lerp(innerHeight, outerHeight, t);
      const height = base * (0.6 + rng() * 0.8);
      const width = cellSize * fill * (0.8 + rng() * 0.4);
      const depth = cellSize * fill * (0.8 + rng() * 0.4);
      const jitterE = (rng() - 0.5) * cellSize * 0.2;
      const jitterN = (rng() - 0.5) * cellSize * 0.2;
      const rotation = (rng() - 0.5) * 0.12; // mostly grid-aligned, a touch loose

      blocks.push({
        cx: cellE + jitterE,
        cn: cellN + jitterN,
        width,
        depth,
        height,
        rotation,
      });
    }
  }

  return blocks;
}

// Hash a cell coordinate and seed into a well-mixed 32-bit state so adjacent
// cells diverge and the whole field is reproducible.
function hashCell(ix: number, iy: number, seed: number): number {
  let h =
    (Math.imul(ix, 73856093) ^
      Math.imul(iy, 19349663) ^
      Math.imul(seed, 83492791)) >>>
    0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
