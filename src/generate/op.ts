import { z } from "zod";
import { RegionRefSchema, AnchorRefSchema, AxisRefSchema } from "./reference";

// The generative op vocabulary (ADR-R17): district-level creative intent over real regions and
// anchors, never geometry. The agent emits these; the procedural layer (G1) expands them to
// grounded footprints, heights, and streets. Every numeric is bounded and every reference names a
// real feature (src/generate/reference.ts), so the model never computes a coordinate. The direct
// descendant of the EditOp union (src/mutation/editOp.ts), scaled from one building to a district.

// ─── Shared bounded scalars ─────────────────────────────────────────────────────

// Seed pins the PRNG so a district re-expands identically on the client (the determinism gate,
// ADR-R23). uint32; Math.random is banned engine-wide, so the only randomness is seeded.
export const SeedSchema = z.number().int().min(0).max(0xffffffff);

const DistrictId = z.string().min(1);

// Storeys match the building gizmo bound (1..120, ADR-R11), so generated and edited heights share
// a scale.
const Storeys = z.number().int().min(1).max(120);

// ─── The five ops ───────────────────────────────────────────────────────────────

export const DefineDistrictSchema = z.object({
  op: z.literal("DefineDistrict"),
  district: DistrictId,
  region: RegionRefSchema,
  seed: SeedSchema,
});

export const LayStreetsSchema = z.object({
  op: z.literal("LayStreets"),
  district: DistrictId,
  pattern: z.enum(["grid", "perimeter"]),
  blockSizeM: z.number().min(40).max(200),
  primaryAxis: AxisRefSchema,
  carFree: z.boolean(),
});

// target is the GOAL; the height envelope and coverage are HARD CONSTRAINTS (ADR-R20). They are
// not independent, they are three ways of constraining the same built floor area, so the expander
// (G1) fills to the envelope and reports achieved-versus-requested with an explicit shortfall (see
// FillResult and FILL_PRECEDENCE in ./types), never overrunning the height cap or silently missing
// the target. The shortfall is the signal the agent reads to raise the height or widen the zone.
export const FillTargetSchema = z.union([
  z.object({ unitsPerHa: z.number().min(50).max(2000) }),
  z.object({ population: z.number().int().min(500).max(200000) }),
]);

export const HeightEnvelopeSchema = z
  .object({ minStoreys: Storeys, maxStoreys: Storeys })
  .refine((e) => e.minStoreys <= e.maxStoreys, {
    message: "minStoreys must be <= maxStoreys",
  });

export const FillBlocksSchema = z.object({
  op: z.literal("FillBlocks"),
  district: DistrictId,
  program: z.enum(["residential", "office", "mixed"]),
  target: FillTargetSchema,
  heightEnvelope: HeightEnvelopeSchema,
  coverage: z.number().min(0.1).max(0.9),
});

// The park or plaza. maxAspect is a degeneracy floor (ADR-R20): the expander may not satisfy areaM2
// with a thin sliver against a building edge, because the park's footprint is what the sun-access
// and reachability scores read. A floor on shape, not full shape authoring.
export const OpenSpaceWhereSchema = z.union([
  RegionRefSchema,
  z.literal("central"),
  AnchorRefSchema,
]);

export const PlaceOpenSpaceSchema = z.object({
  op: z.literal("PlaceOpenSpace"),
  district: DistrictId,
  where: OpenSpaceWhereSchema,
  areaM2: z.number().min(500),
  maxAspect: z.number().min(1).max(4).default(2.5),
});

// The shaping field, the answer to "stepping down to the water" and "denser near the water".
// falloffShape is the descent curve: "smooth" is a smoothstep that reads as a graceful skyline,
// "linear" is a plain ramp. The curve is the difference between an elegant descent and a staircase
// on the most-typed directive in the pitch, so the agent picks it explicitly (no default).
export const ApplyGradientSchema = z.object({
  op: z.literal("ApplyGradient"),
  district: DistrictId,
  field: z.enum(["height", "density"]),
  anchor: AnchorRefSchema,
  falloffM: z.number().min(50).max(2000),
  falloffShape: z.enum(["linear", "smooth"]),
  direction: z.enum(["down", "up"]),
});

// ─── The union ──────────────────────────────────────────────────────────────────

export const GenerativeOpSchema = z.discriminatedUnion("op", [
  DefineDistrictSchema,
  LayStreetsSchema,
  FillBlocksSchema,
  PlaceOpenSpaceSchema,
  ApplyGradientSchema,
]);

export type DefineDistrictOp = z.infer<typeof DefineDistrictSchema>;
export type LayStreetsOp = z.infer<typeof LayStreetsSchema>;
export type FillBlocksOp = z.infer<typeof FillBlocksSchema>;
export type PlaceOpenSpaceOp = z.infer<typeof PlaceOpenSpaceSchema>;
export type ApplyGradientOp = z.infer<typeof ApplyGradientSchema>;
export type GenerativeOp = z.infer<typeof GenerativeOpSchema>;
