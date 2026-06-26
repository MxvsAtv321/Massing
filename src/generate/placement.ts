// Choose where the hard-coded G2 directive lands so it sits on a real block aligned to the real
// streets, not floating in an intersection. The agent (G5) chooses placement itself; this is a
// reasonable fixed choice for the no-agent milestone. Pure, ENU [east, north] metres.

// The cluster centroid nearest a point, so the block lands on real buildings it then replaces.
export function nearestCentroid(
  centroids: Record<string, [number, number]>,
  to: [number, number]
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD2 = Infinity;
  for (const id of Object.keys(centroids)) {
    const c = centroids[id];
    const de = c[0] - to[0];
    const dn = c[1] - to[1];
    const d2 = de * de + dn * dn;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = c;
    }
  }
  return best;
}

// Bearing in degrees (0..360) of the street segment nearest a point, for orienting the generated grid
// to the real street grid. Null when there are no street segments.
export function nearestStreetBearingDeg(
  streets: { path: [number, number][] }[],
  to: [number, number]
): number | null {
  let bestD2 = Infinity;
  let bearing: number | null = null;
  for (const s of streets) {
    for (let i = 0; i + 1 < s.path.length; i++) {
      const a = s.path[i];
      const b = s.path[i + 1];
      const d2 = pointToSegmentDistSq(to, a, b);
      if (d2 < bestD2) {
        bestD2 = d2;
        const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        bearing = ((deg % 360) + 360) % 360; // normalize to the schema's 0..360
      }
    }
  }
  return bearing;
}

export function pointToSegmentDistSq(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = p[0] - (a[0] + t * vx);
  const dy = p[1] - (a[1] + t * vy);
  return dx * dx + dy * dy;
}
