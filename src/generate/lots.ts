import { type Grid, axisToEnu } from "./grid";
import type { Block } from "./blocks";
import type { Rng } from "./rng";

// Subdivide a block into lots by recursive oriented-bounding-box splitting in the grid's axis frame,
// so the splits inherit the grid orientation and map to ENU through the grid's once-computed cos/sin
// (no per-vertex trig, ADR-R23). The longer side is split until both sides fall within the lot-size
// band; the split point carries a small seeded jitter so lots are not perfectly uniform. Output is
// sorted by axis position, so it never depends on the recursion's stack order. Pure.

export type Lot = {
  id: string; // `${blockId}/l${k}`
  blockId: string;
  ring: [number, number][]; // ENU corners
  centroid: [number, number]; // ENU
  areaM2: number;
};

export type SubdivideOpts = {
  maxLotSizeM: number; // split until both axis-frame sides are at or under this
  jitterFrac?: number; // 0..1, how far the split point may stray from the midpoint
};

type Rect = { u0: number; u1: number; v0: number; v1: number };

export function subdivideBlock(
  grid: Grid,
  block: Block,
  opts: SubdivideOpts,
  rng: Rng
): Lot[] {
  const cell = grid.cellSize;
  const baseU = grid.u0 + block.i * cell;
  const baseV = grid.v0 + block.j * cell;
  const root: Rect = { u0: baseU, u1: baseU + cell, v0: baseV, v1: baseV + cell };

  const rects: Rect[] = [];
  const stack: Rect[] = [root];
  const jitter = opts.jitterFrac ?? 0;

  while (stack.length > 0) {
    const r = stack.pop()!;
    const du = r.u1 - r.u0;
    const dv = r.v1 - r.v0;
    if (du <= opts.maxLotSizeM && dv <= opts.maxLotSizeM) {
      rects.push(r);
      continue;
    }
    const f = 0.5 + (rng() - 0.5) * jitter; // always draw, so the stream advances predictably
    if (du >= dv) {
      const um = r.u0 + du * f;
      stack.push({ u0: r.u0, u1: um, v0: r.v0, v1: r.v1 });
      stack.push({ u0: um, u1: r.u1, v0: r.v0, v1: r.v1 });
    } else {
      const vm = r.v0 + dv * f;
      stack.push({ u0: r.u0, u1: r.u1, v0: r.v0, v1: vm });
      stack.push({ u0: r.u0, u1: r.u1, v0: vm, v1: r.v1 });
    }
  }

  // Stable order independent of the stack: along axis, then across.
  rects.sort((a, b) => a.u0 - b.u0 || a.v0 - b.v0);

  return rects.map((r, k) => {
    const ring: [number, number][] = [
      axisToEnu(grid, r.u0, r.v0),
      axisToEnu(grid, r.u1, r.v0),
      axisToEnu(grid, r.u1, r.v1),
      axisToEnu(grid, r.u0, r.v1),
    ];
    return {
      id: `${block.id}/l${k}`,
      blockId: block.id,
      ring,
      centroid: axisToEnu(grid, (r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2),
      areaM2: (r.u1 - r.u0) * (r.v1 - r.v0), // axis-frame area equals ENU area under rotation
    };
  });
}
