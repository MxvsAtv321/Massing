// Flat ground ribbons for the generated street grid (G3). Pure and THREE-free: returns position and
// index arrays the renderer wraps in a BufferGeometry, so the ribbon math unit-tests in node. Each
// polyline segment becomes a quad of the given width sitting just above the ground. World space:
// x = east, y = up, z = -north (the shared axis map).

export type RibbonData = { positions: Float32Array; indices: Uint32Array };

export function ribbonData(
  polylines: [number, number][][],
  halfWidth: number,
  y: number
): RibbonData {
  const verts: number[] = [];
  const idx: number[] = [];
  let base = 0;

  for (const line of polylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [e0, n0] = line[i];
      const [e1, n1] = line[i + 1];
      const de = e1 - e0;
      const dn = n1 - n0;
      const len = Math.hypot(de, dn);
      if (len < 1e-6) continue;
      // Unit perpendicular in ENU, scaled to the ribbon half width.
      const ox = (-dn / len) * halfWidth;
      const on = (de / len) * halfWidth;
      const corners: [number, number][] = [
        [e0 + ox, n0 + on],
        [e0 - ox, n0 - on],
        [e1 - ox, n1 - on],
        [e1 + ox, n1 + on],
      ];
      for (const [e, n] of corners) verts.push(e, y, -n);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
  }

  return { positions: new Float32Array(verts), indices: new Uint32Array(idx) };
}
