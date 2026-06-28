// A max-height grid of the city, the occluder for the sun-access raymarch (Unit 8,
// increment 8.3). Each cell holds the tallest building height over it in metres,
// 0 where there is open ground. Built once on the main thread from the real
// footprints and heights, then handed to the worker. THREE-free and pure so it
// unit-tests in node. The grid covers the city bounds: the context ring casts no
// shadows (it is invented fabric), so only the real city can occlude the sun.

export type Heightfield = {
  originE: number; // ENU east of the (0,0) cell corner
  originN: number; // ENU north of the (0,0) cell corner
  cellSize: number; // metres per cell
  width: number; // cells east
  height: number; // cells north
  maxH: Float32Array; // length width*height, tallest building over each cell, metres
  maxHeight: number; // global max, the raymarch early-out ceiling
  conf: Uint8Array; // length width*height, confidence code of the tallest building over each cell (I3a)
};

// The height-provenance class of an occluder, for the shadow ledger (I3a, ADR-R26). Trusted occluders
// are measured heights and the proposal's own generated geometry; untrusted are estimated or
// hypothetical heights whose shadow boundary is uncertain.
export type OccluderConfidence = "measured" | "estimated" | "hypothetical" | "generated";

// Cell encoding: 0 open ground (no building), then the four classes. Kept as small integers so the
// parallel field is a Uint8Array the raymarch reads cheaply.
export const CONF_OPEN = 0;
export const CONF_MEASURED = 1;
export const CONF_ESTIMATED = 2;
export const CONF_HYPOTHETICAL = 3;
export const CONF_GENERATED = 4;

export function confCode(c: OccluderConfidence): number {
  switch (c) {
    case "measured":
      return CONF_MEASURED;
    case "estimated":
      return CONF_ESTIMATED;
    case "hypothetical":
      return CONF_HYPOTHETICAL;
    case "generated":
      return CONF_GENERATED;
  }
}

export type HeightfieldBuilding = {
  footprint: number[][][]; // ENU rings [east, north]; ring 0 is the outer
  height: number; // metres above grade
  confidence?: OccluderConfidence; // height provenance; unknown defaults to estimated (conservative)
};

export type HeightfieldSpec = {
  originE: number;
  originN: number;
  cellSize: number;
  width: number;
  height: number;
};

// A square grid spanning the model bounds at the given cell size.
export function heightfieldSpecForBounds(
  center: [number, number],
  radius: number,
  cellSize: number
): HeightfieldSpec {
  const cells = Math.max(1, Math.ceil((radius * 2) / cellSize));
  return {
    originE: center[0] - radius,
    originN: center[1] - radius,
    cellSize,
    width: cells,
    height: cells,
  };
}

// Rasterize each footprint at its height into the grid, keeping the max per cell.
// Holes are ignored: a courtyard letting light through is a second-order effect at
// this resolution, and treating the outer ring as solid is the conservative choice
// for occlusion. Cell centers inside the outer ring take the building height.
export function buildHeightfield(
  buildings: HeightfieldBuilding[],
  spec: HeightfieldSpec
): Heightfield {
  const { originE, originN, cellSize, width, height } = spec;
  const maxH = new Float32Array(width * height);
  const conf = new Uint8Array(width * height);
  let maxHeight = 0;

  for (const b of buildings) {
    if (b.height <= 0) continue;
    const ring = b.footprint[0];
    if (!ring || ring.length < 3) continue;
    const code = confCode(b.confidence ?? "estimated");

    let minE = Infinity;
    let minN = Infinity;
    let maxE = -Infinity;
    let maxN = -Infinity;
    for (const [e, n] of ring) {
      if (e < minE) minE = e;
      if (e > maxE) maxE = e;
      if (n < minN) minN = n;
      if (n > maxN) maxN = n;
    }

    const ci0 = Math.max(0, Math.floor((minE - originE) / cellSize));
    const ci1 = Math.min(width - 1, Math.floor((maxE - originE) / cellSize));
    const cj0 = Math.max(0, Math.floor((minN - originN) / cellSize));
    const cj1 = Math.min(height - 1, Math.floor((maxN - originN) / cellSize));

    for (let cj = cj0; cj <= cj1; cj++) {
      const nc = originN + (cj + 0.5) * cellSize;
      for (let ci = ci0; ci <= ci1; ci++) {
        const ec = originE + (ci + 0.5) * cellSize;
        if (pointInRing(ring, ec, nc)) {
          const idx = cj * width + ci;
          if (b.height > maxH[idx]) {
            maxH[idx] = b.height;
            conf[idx] = code; // the tallest building owns the cell, so it owns the shadow it casts
          }
        }
      }
    }
    if (b.height > maxHeight) maxHeight = b.height;
  }

  return { originE, originN, cellSize, width, height, maxH, maxHeight, conf };
}

// Tallest building height over an ENU point, 0 on open ground or outside the grid.
export function sampleHeightAt(
  field: Heightfield,
  e: number,
  n: number
): number {
  const ci = Math.floor((e - field.originE) / field.cellSize);
  const cj = Math.floor((n - field.originN) / field.cellSize);
  if (ci < 0 || cj < 0 || ci >= field.width || cj >= field.height) return 0;
  return field.maxH[cj * field.width + ci];
}

function pointInRing(ring: number[][], e: number, n: number): boolean {
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
