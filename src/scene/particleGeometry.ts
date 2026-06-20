// Pure helpers for the flow animation. Particles ride the edge polylines; density and
// speed come from the simulated flow. Illustrative, not real vehicles (ADR-010).

// Position at fractional distance t (0..1) along an ENU polyline.
export function sampleAlongPolyline(poly: [number, number][], t: number): [number, number] {
  if (poly.length === 0) return [0, 0];
  if (poly.length === 1) return poly[0];

  const clamped = Math.max(0, Math.min(1, t));
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    segLen.push(d);
    total += d;
  }
  if (total === 0) return poly[0];

  let target = clamped * total;
  for (let i = 0; i < segLen.length; i++) {
    if (target <= segLen[i] || i === segLen.length - 1) {
      const f = segLen[i] > 0 ? target / segLen[i] : 0;
      const a = poly[i];
      const b = poly[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= segLen[i];
  }
  return poly[poly.length - 1];
}

// Number of particles for an edge's volume: proportional, with a floor of 1 on any loaded
// edge and a cap so a single jammed link does not swamp the instance budget.
export function particleCountForVolume(volume: number, perParticle = 200, cap = 8): number {
  if (volume <= 0) return 0;
  return Math.min(cap, Math.max(1, Math.round(volume / perParticle)));
}
