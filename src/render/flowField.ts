// Pure helpers that turn the BPR flow field into something the road overlay and
// (later) the agents can read. The flow itself comes from the kept solver
// (src/traffic/assignment.ts); here we only map per-edge v/c to a colour and key
// directed edges back to the rendered (deduped) centerlines. THREE-free, tested.

type RGB = [number, number, number];

export function clampCongestion(vc: number): number {
  return Math.max(0, Math.min(1, vc));
}

// Green (free) -> amber (busy) -> red (jammed), by volume/capacity.
export function congestionColor(c: number): RGB {
  const x = clampCongestion(c);
  const FREE: RGB = [0.18, 0.7, 0.35];
  const BUSY: RGB = [0.9, 0.7, 0.15];
  const JAM: RGB = [0.95, 0.2, 0.12];
  return x < 0.5 ? lerp3(FREE, BUSY, x / 0.5) : lerp3(BUSY, JAM, (x - 0.5) / 0.5);
}

// Emissive contribution for a road ribbon: the congestion colour scaled by an
// ease-in of load, so free-flowing roads stay dark asphalt and only busy roads
// light up (and bloom at night). Premultiplied so the material just reads it.
export function congestionEmissive(c: number): RGB {
  const x = clampCongestion(c);
  const k = x * x; // ease-in: light and medium load stay subtle
  const [r, g, b] = congestionColor(x);
  return [r * k, g * k, b * k];
}

// The rendered streets are deduped to undirected centerlines while flow is per
// directed edge. This is the shared key (same formula as the dedup in
// app/page.tsx) so a street's two directions map to one ribbon.
export function dedupKey(osmWayId: number, from: string, to: string): string {
  return `${osmWayId}:${[from, to].sort().join("-")}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerp3(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
