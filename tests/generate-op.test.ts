import { describe, it, expect } from "vitest";
import {
  GenerativeOpSchema,
  DefineDistrictSchema,
  LayStreetsSchema,
  FillBlocksSchema,
  PlaceOpenSpaceSchema,
  ApplyGradientSchema,
} from "../src/generate/op";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RECT_REGION = {
  kind: "rect" as const,
  center: [0, 0] as [number, number],
  halfExtents: [100, 80] as [number, number],
  rotationRad: 0,
};

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

// ─── DefineDistrict ─────────────────────────────────────────────────────────────

describe("DefineDistrictSchema", () => {
  const base = { op: "DefineDistrict", district: "d1", region: RECT_REGION, seed: 42 };

  it("accepts a valid define with a uint32 seed", () => {
    expect(ok(DefineDistrictSchema, base)).toBe(true);
    expect(ok(DefineDistrictSchema, { ...base, seed: 0 })).toBe(true);
    expect(ok(DefineDistrictSchema, { ...base, seed: 0xffffffff })).toBe(true);
  });

  it("rejects a seed that is negative, fractional, or past uint32", () => {
    expect(ok(DefineDistrictSchema, { ...base, seed: -1 })).toBe(false);
    expect(ok(DefineDistrictSchema, { ...base, seed: 1.5 })).toBe(false);
    expect(ok(DefineDistrictSchema, { ...base, seed: 0x100000000 })).toBe(false);
  });

  it("rejects a missing region and an empty district id", () => {
    expect(ok(DefineDistrictSchema, { op: "DefineDistrict", district: "d1", seed: 1 })).toBe(false);
    expect(ok(DefineDistrictSchema, { ...base, district: "" })).toBe(false);
  });
});

// ─── LayStreets ─────────────────────────────────────────────────────────────────

describe("LayStreetsSchema", () => {
  const base = {
    op: "LayStreets",
    district: "d1",
    pattern: "grid",
    blockSizeM: 80,
    primaryAxis: { kind: "bearing", deg: 0 },
    carFree: true,
  };

  it("accepts grid and perimeter with a block size in range", () => {
    expect(ok(LayStreetsSchema, base)).toBe(true);
    expect(ok(LayStreetsSchema, { ...base, pattern: "perimeter" })).toBe(true);
    expect(ok(LayStreetsSchema, { ...base, blockSizeM: 40 })).toBe(true);
    expect(ok(LayStreetsSchema, { ...base, blockSizeM: 200 })).toBe(true);
  });

  it("rejects a block size outside 40..200 and an unknown pattern", () => {
    expect(ok(LayStreetsSchema, { ...base, blockSizeM: 39 })).toBe(false);
    expect(ok(LayStreetsSchema, { ...base, blockSizeM: 201 })).toBe(false);
    expect(ok(LayStreetsSchema, { ...base, pattern: "organic" })).toBe(false);
  });

  it("requires carFree to be present", () => {
    const { carFree, ...noCarFree } = base;
    expect(ok(LayStreetsSchema, noCarFree)).toBe(false);
  });

  it("accepts a parallelTo axis", () => {
    expect(
      ok(LayStreetsSchema, { ...base, primaryAxis: { kind: "parallelTo", anchor: "waterEdge" } })
    ).toBe(true);
  });
});

// ─── FillBlocks (the precedence-bearing op) ─────────────────────────────────────

describe("FillBlocksSchema", () => {
  const base = {
    op: "FillBlocks",
    district: "d1",
    program: "residential",
    target: { unitsPerHa: 600 },
    heightEnvelope: { minStoreys: 4, maxStoreys: 20 },
    coverage: 0.4,
  };

  it("accepts either target form in range", () => {
    expect(ok(FillBlocksSchema, base)).toBe(true);
    expect(ok(FillBlocksSchema, { ...base, target: { population: 40000 } })).toBe(true);
    expect(ok(FillBlocksSchema, { ...base, target: { unitsPerHa: 50 } })).toBe(true);
    expect(ok(FillBlocksSchema, { ...base, target: { unitsPerHa: 2000 } })).toBe(true);
  });

  it("rejects out-of-range targets and a fractional population", () => {
    expect(ok(FillBlocksSchema, { ...base, target: { unitsPerHa: 49 } })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, target: { unitsPerHa: 2001 } })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, target: { population: 499 } })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, target: { population: 200001 } })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, target: { population: 1000.5 } })).toBe(false);
  });

  it("enforces minStoreys <= maxStoreys and the 1..120 storey bound", () => {
    expect(ok(FillBlocksSchema, { ...base, heightEnvelope: { minStoreys: 20, maxStoreys: 20 } })).toBe(true);
    expect(ok(FillBlocksSchema, { ...base, heightEnvelope: { minStoreys: 21, maxStoreys: 20 } })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, heightEnvelope: { minStoreys: 0, maxStoreys: 20 } })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, heightEnvelope: { minStoreys: 1, maxStoreys: 121 } })).toBe(false);
  });

  it("rejects coverage outside 0.1..0.9", () => {
    expect(ok(FillBlocksSchema, { ...base, coverage: 0.09 })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, coverage: 0.91 })).toBe(false);
    expect(ok(FillBlocksSchema, { ...base, coverage: 0.9 })).toBe(true);
  });
});

// ─── PlaceOpenSpace (the degeneracy-floor op) ───────────────────────────────────

describe("PlaceOpenSpaceSchema", () => {
  const base = { op: "PlaceOpenSpace", district: "d1", where: "central", areaM2: 5000 };

  it("accepts a region, the central keyword, or an anchor for where", () => {
    expect(ok(PlaceOpenSpaceSchema, base)).toBe(true);
    expect(ok(PlaceOpenSpaceSchema, { ...base, where: RECT_REGION })).toBe(true);
    expect(ok(PlaceOpenSpaceSchema, { ...base, where: "waterEdge" })).toBe(true);
    expect(ok(PlaceOpenSpaceSchema, { ...base, where: { kind: "street", name: "Front St" } })).toBe(true);
  });

  it("rejects an area below the floor", () => {
    expect(ok(PlaceOpenSpaceSchema, { ...base, areaM2: 499 })).toBe(false);
  });

  it("defaults maxAspect to 2.5 and bounds it to 1..4", () => {
    const parsed = PlaceOpenSpaceSchema.parse(base);
    expect(parsed.maxAspect).toBe(2.5);
    expect(ok(PlaceOpenSpaceSchema, { ...base, maxAspect: 1 })).toBe(true);
    expect(ok(PlaceOpenSpaceSchema, { ...base, maxAspect: 4 })).toBe(true);
    expect(ok(PlaceOpenSpaceSchema, { ...base, maxAspect: 0.9 })).toBe(false);
    expect(ok(PlaceOpenSpaceSchema, { ...base, maxAspect: 4.1 })).toBe(false);
  });
});

// ─── ApplyGradient (the falloff-shape op) ───────────────────────────────────────

describe("ApplyGradientSchema", () => {
  const base = {
    op: "ApplyGradient",
    district: "d1",
    field: "height",
    anchor: "waterEdge",
    falloffM: 400,
    falloffShape: "smooth",
    direction: "down",
  };

  it("accepts both falloff shapes and both directions", () => {
    expect(ok(ApplyGradientSchema, base)).toBe(true);
    expect(ok(ApplyGradientSchema, { ...base, falloffShape: "linear" })).toBe(true);
    expect(ok(ApplyGradientSchema, { ...base, direction: "up", field: "density" })).toBe(true);
  });

  it("requires falloffShape to be present and known", () => {
    const { falloffShape, ...noShape } = base;
    expect(ok(ApplyGradientSchema, noShape)).toBe(false);
    expect(ok(ApplyGradientSchema, { ...base, falloffShape: "curvy" })).toBe(false);
  });

  it("rejects a falloff distance outside 50..2000 and an unknown field", () => {
    expect(ok(ApplyGradientSchema, { ...base, falloffM: 49 })).toBe(false);
    expect(ok(ApplyGradientSchema, { ...base, falloffM: 2001 })).toBe(false);
    expect(ok(ApplyGradientSchema, { ...base, field: "color" })).toBe(false);
  });
});

// ─── The union ──────────────────────────────────────────────────────────────────

describe("GenerativeOpSchema", () => {
  it("round-trips each op through the discriminated union", () => {
    const ops = [
      { op: "DefineDistrict", district: "d1", region: RECT_REGION, seed: 42 },
      {
        op: "LayStreets",
        district: "d1",
        pattern: "grid",
        blockSizeM: 80,
        primaryAxis: { kind: "bearing", deg: 30 },
        carFree: true,
      },
      {
        op: "FillBlocks",
        district: "d1",
        program: "mixed",
        target: { population: 40000 },
        heightEnvelope: { minStoreys: 4, maxStoreys: 30 },
        coverage: 0.45,
      },
      { op: "PlaceOpenSpace", district: "d1", where: "central", areaM2: 8000, maxAspect: 2 },
      {
        op: "ApplyGradient",
        district: "d1",
        field: "height",
        anchor: "waterEdge",
        falloffM: 500,
        falloffShape: "smooth",
        direction: "down",
      },
    ];
    for (const o of ops) {
      const r = GenerativeOpSchema.safeParse(o);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.op).toBe(o.op);
    }
  });

  it("rejects an unknown op", () => {
    expect(ok(GenerativeOpSchema, { op: "DemolishCity", district: "d1" })).toBe(false);
  });
});
