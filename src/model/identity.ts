import type { Footprint } from "./types";

// The minimal geometry the signature hashes: an id, a footprint, and a height. BuildingForScene satisfies
// it directly; the model's Building maps in (height.value).
export type IdentityGeom = { readonly id: string; readonly footprint: Footprint; readonly heightValue: number };

// A deterministic hash of the geometry the scorers and the signature read: every footprint vertex and
// every height, rounded to millimetre precision. This is the identity half of the appearance-not-identity
// gate (V1, ADR-R29): if a visual change ever mutated a footprint or a height, this signature moves and
// the invariance test fails. Pure, deterministic, transcendental-free (FNV-1a over rounded integers), so
// it is bit-stable run to run, which is exactly what the before-and-after-the-visual-layer check needs.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mix(h: number, n: number): number {
  let x = h;
  for (let i = 0; i < 4; i++) {
    x ^= (n >>> (i * 8)) & 0xff;
    x = Math.imul(x, FNV_PRIME);
  }
  return x >>> 0;
}

export function cityIdentitySignature(buildings: readonly IdentityGeom[]): string {
  const sorted = [...buildings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let h = FNV_OFFSET >>> 0;
  for (const b of sorted) {
    for (let i = 0; i < b.id.length; i++) h = mix(h, b.id.charCodeAt(i));
    h = mix(h, Math.round(b.heightValue * 1000));
    for (const ring of b.footprint) {
      for (const pt of ring) {
        h = mix(h, Math.round(pt[0] * 1000));
        h = mix(h, Math.round(pt[1] * 1000));
      }
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
