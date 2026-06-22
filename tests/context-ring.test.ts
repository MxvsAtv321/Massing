import { describe, it, expect } from "vitest";
import { buildContextRing, type ContextRingOptions } from "../src/render/contextRing";

const opts: ContextRingOptions = {
  center: [0, 0],
  innerRadius: 200,
  outerRadius: 700,
  cellSize: 100,
  seed: 42,
};

describe("buildContextRing", () => {
  it("places every block inside the annulus, never in the city core", () => {
    const blocks = buildContextRing(opts);
    expect(blocks.length).toBeGreaterThan(0);
    const tol = (opts.cellSize ?? 110) * 0.5;
    for (const b of blocks) {
      const d = Math.hypot(b.cx - opts.center[0], b.cn - opts.center[1]);
      expect(d).toBeGreaterThanOrEqual(opts.innerRadius - tol);
      expect(d).toBeLessThanOrEqual(opts.outerRadius + tol);
    }
  });

  it("is deterministic for a seed and varies when the seed changes", () => {
    const a = buildContextRing(opts);
    const b = buildContextRing(opts);
    expect(b).toEqual(a);

    const c = buildContextRing({ ...opts, seed: 7 });
    const differs =
      c.length !== a.length ||
      c.some((blk, i) => !a[i] || blk.cx !== a[i].cx || blk.height !== a[i].height);
    expect(differs).toBe(true);
  });

  it("tapers lower toward the outer edge so it fades into haze", () => {
    const blocks = buildContextRing(opts);
    const mid = (opts.innerRadius + opts.outerRadius) / 2;
    const inner = blocks.filter((b) => Math.hypot(b.cx, b.cn) < mid);
    const outer = blocks.filter((b) => Math.hypot(b.cx, b.cn) >= mid);
    expect(inner.length).toBeGreaterThan(0);
    expect(outer.length).toBeGreaterThan(0);

    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(inner.map((b) => b.height))).toBeGreaterThan(
      mean(outer.map((b) => b.height))
    );
  });

  it("produces valid box dimensions for every block", () => {
    const blocks = buildContextRing(opts);
    for (const b of blocks) {
      expect(b.height).toBeGreaterThan(0);
      expect(b.width).toBeGreaterThan(0);
      expect(b.depth).toBeGreaterThan(0);
    }
  });
});
