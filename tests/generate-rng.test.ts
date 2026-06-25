import { describe, it, expect } from "vitest";
import { splitmix32, randInt, randRange } from "../src/generate/rng";

// ─── Determinism (the contract this PRNG exists for) ────────────────────────────

describe("splitmix32", () => {
  it("produces the same stream for the same seed", () => {
    const a = splitmix32(123456789);
    const b = splitmix32(123456789);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = splitmix32(1);
    const b = splitmix32(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("returns floats in [0, 1)", () => {
    const r = splitmix32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("handles seed 0 and large uint32 seeds deterministically", () => {
    expect(splitmix32(0)()).toBe(splitmix32(0)());
    expect(splitmix32(0xffffffff)()).toBe(splitmix32(0xffffffff)());
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────────

describe("randInt / randRange", () => {
  it("randInt stays within [0, n) and is deterministic", () => {
    const a = splitmix32(7);
    const b = splitmix32(7);
    for (let i = 0; i < 100; i++) {
      const va = randInt(a, 10);
      const vb = randInt(b, 10);
      expect(va).toBe(vb);
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(10);
    }
  });

  it("randRange stays within [lo, hi)", () => {
    const r = splitmix32(99);
    for (let i = 0; i < 100; i++) {
      const v = randRange(r, -5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });
});
