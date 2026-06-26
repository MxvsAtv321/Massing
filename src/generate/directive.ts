import { GenerativeOpSchema, type GenerativeOp } from "./op";
import type { RegionRef } from "./reference";

// The first directive (G2): "fill this block with N-storey residential", hard-coded, no agent. It is
// the smallest end-to-end intent: claim a block, lay a grid, fill it at a uniform height. No gradient
// and no open space, so the result is a clean uniform-height block, the simplest thing that proves
// intent to grounded geometry to live render to measured consequence. The agent emits the same op
// shape later (G5); this is one canned instance of it.

export type FillBlockDirective = {
  district: string;
  region: RegionRef;
  seed: number;
  storeys: number;
  bearingDeg?: number; // grid orientation; default 0 (ENU east). Set to the local street bearing.
  blockSizeM?: number; // default 80, about one city block
  coverage?: number; // default 0.45
};

export function fillBlockDirective(d: FillBlockDirective): GenerativeOp[] {
  const blockSizeM = d.blockSizeM ?? 80;
  const coverage = d.coverage ?? 0.45;
  const raw = [
    { op: "DefineDistrict", district: d.district, region: d.region, seed: d.seed },
    {
      op: "LayStreets",
      district: d.district,
      pattern: "grid",
      blockSizeM,
      primaryAxis: { kind: "bearing", deg: d.bearingDeg ?? 0 },
      carFree: true,
    },
    {
      op: "FillBlocks",
      district: d.district,
      program: "residential",
      target: { unitsPerHa: 600 },
      // Uniform height: min equals max, so every lot is exactly N storeys (no gradient).
      heightEnvelope: { minStoreys: d.storeys, maxStoreys: d.storeys },
      coverage,
    },
  ];
  return raw.map((o) => GenerativeOpSchema.parse(o));
}

// A multi-block district (G3): a bigger region than fillBlockDirective, several blocks of residential.
// Uniform height for now; height gradients and open space are the demo upgrade (G6). The op shape is
// the same union the agent emits later, so this is one canned district.
export type DistrictDirective = {
  district: string;
  region: RegionRef;
  seed: number;
  storeys: number;
  bearingDeg?: number;
  blockSizeM?: number; // default 80; a district region spans several of these
  coverage?: number; // default 0.4
};

export function districtDirective(d: DistrictDirective): GenerativeOp[] {
  const blockSizeM = d.blockSizeM ?? 80;
  const coverage = d.coverage ?? 0.4;
  const raw = [
    { op: "DefineDistrict", district: d.district, region: d.region, seed: d.seed },
    {
      op: "LayStreets",
      district: d.district,
      pattern: "grid",
      blockSizeM,
      primaryAxis: { kind: "bearing", deg: d.bearingDeg ?? 0 },
      carFree: true,
    },
    {
      op: "FillBlocks",
      district: d.district,
      program: "residential",
      target: { unitsPerHa: 700 },
      heightEnvelope: { minStoreys: d.storeys, maxStoreys: d.storeys },
      coverage,
    },
  ];
  return raw.map((o) => GenerativeOpSchema.parse(o));
}
