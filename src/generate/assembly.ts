import { splitmix32 } from "./rng";
import type { BoxInstance } from "./instances";

// The assembly animation timing (G3): each tower rises from the ground, staggered as a spatial sweep
// across the district, so the place reads as building itself. Pure and deterministic so the stagger is
// stable and testable; the renderer reads these to drive a per-instance Y-scale. The InstancedMesh is
// built once and only its matrices animate, which is how the assembly holds 60 fps (ADR-R18), no
// buffer growth, no rebuild.

export type AssemblyParams = {
  durationS: number; // total assembly window
  riseS: number; // time for one tower to rise
  jitterS?: number; // small per-instance randomness on the start
};

// Per-instance start delay in seconds: a sweep from the near corner of the district outward, so the
// district assembles as a wave rather than all at once.
export function assemblyDelays(
  boxes: BoxInstance[],
  params: AssemblyParams,
  seed: number
): number[] {
  if (boxes.length === 0) return [];
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const b of boxes) {
    if (b.cx < minE) minE = b.cx;
    if (b.cx > maxE) maxE = b.cx;
    if (b.cn < minN) minN = b.cn;
    if (b.cn > maxN) maxN = b.cn;
  }
  const span = Math.hypot(maxE - minE, maxN - minN) || 1;
  const window = Math.max(0, params.durationS - params.riseS);
  const jitter = params.jitterS ?? 0;
  const rng = splitmix32(seed);
  return boxes.map((b) => {
    const sweep = (Math.hypot(b.cx - minE, b.cn - minN) / span) * window; // 0..window
    const j = jitter > 0 ? (rng() - 0.5) * jitter : 0;
    let t = sweep + j;
    if (t < 0) t = 0;
    else if (t > window) t = window;
    return t;
  });
}

// Eased rise 0..1 for an instance at elapsed time t given its start delay. easeOutCubic, a pure
// polynomial (no transcendental).
export function assemblyScale(t: number, delay: number, riseS: number): number {
  if (t <= delay) return 0;
  if (t >= delay + riseS) return 1;
  const u = (t - delay) / riseS;
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}
