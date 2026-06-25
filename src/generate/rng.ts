// The seeded PRNG the whole procedural layer draws from, owned in-repo so the random stream is
// bit-identical across node and any browser engine (the determinism gate, ADR-R23). A library gives
// no such guarantee across versions or engines, and Math.random is unseeded, so owning the integer
// math is the foundation, not a preference. splitmix32: Math.imul and uint32 shifts only, with a
// single final division by 2^32, which is exact in IEEE 754 (a power-of-two scale of a 32-bit
// integer) and so bit-identical everywhere. No transcendental ever touches the stream.

export type Rng = () => number; // a float in [0, 1)

export function splitmix32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    t = (t ^ (t >>> 15)) >>> 0;
    return t / 4294967296; // t / 2^32, exact in float64 so identical on every engine
  };
}

// Integer in [0, n). Math.floor of a product is exact; no transcendental.
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

// Float in [lo, hi). Multiply and add only.
export function randRange(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}
