import { emptyOverlay, type EditOverlay } from "../mutation/applyEdit";
import { applyGenerativeOp } from "../generate/overlay";
import {
  expandDistrict,
  geometrySignature,
  type ExpandedDistrict,
  type ExpandOpts,
} from "../generate/expand";
import type { GenerativeOp } from "../generate/op";
import type { GenerativeContext } from "../generate/types";
import type { HeightfieldBuilding, HeightfieldSpec } from "../study/heightfield";
import type { AnalysisRegion, SunHoursSample } from "../study/studyTypes";
import { unitScore } from "../score/units";
import { sunScore } from "../score/sun";
import { reachScore } from "../score/reach";
import { trafficScore, type TrafficInputs } from "../score/traffic";
import type { SunScore, UnitScore, ReachScore, TrafficScore } from "../score/types";

// The server-side sandbox the agent edits (G5): accumulate generative ops into an overlay over the
// untouched baseline (ADR-R19), re-expand on each op, and run the G4 scores on the result. The same
// pure expander the client renders from, so what the agent scores is what the user sees (the
// determinism contract, the G5 gate). Pure of any LLM; the loop drives it through an Agent.

export type SandboxScoreCtx = {
  sun?: {
    region: AnalysisRegion;
    occluders: HeightfieldBuilding[];
    spec: HeightfieldSpec;
    samples: SunHoursSample[];
    resolution: number;
  };
  reach?: { withinMinutes: number; walkSpeedMps?: number };
  traffic?: TrafficInputs;
};

export type ApplyResult =
  | { ok: true; districtId: string; buildingCount: number; gateConnected: boolean; op: GenerativeOp }
  | { ok: false; error: string };

export type ScoreResult =
  | { ok: true; score: UnitScore | SunScore | ReachScore | TrafficScore }
  | { ok: false; error: string };

export class Sandbox {
  private overlay: EditOverlay = emptyOverlay();
  private cache = new Map<string, ExpandedDistrict>();
  private log: GenerativeOp[] = [];

  constructor(
    private ctx: GenerativeContext,
    private opts: ExpandOpts,
    private scoreCtx: SandboxScoreCtx = {}
  ) {}

  applyOp(op: GenerativeOp): ApplyResult {
    let next: EditOverlay;
    try {
      next = applyGenerativeOp(this.overlay, op, this.ctx);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const d = next.generatedDistricts.find((x) => x.id === op.district);
    if (!d) return { ok: false, error: `district ${op.district} not found after op` };

    // A district with only a DefineDistrict is a valid pending state, not an error: it has no streets
    // to expand yet. Once a LayStreets exists, an expansion failure is a real error.
    let ex: ExpandedDistrict | null = null;
    if (d.ops.some((o) => o.op === "LayStreets")) {
      try {
        ex = expandDistrict(d, this.ctx, this.opts);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    this.overlay = next;
    this.log.push(op);
    if (ex) this.cache.set(d.id, ex);
    return {
      ok: true,
      districtId: d.id,
      buildingCount: ex ? ex.massing.length : 0,
      gateConnected: ex ? ex.gate.connected : false,
      op,
    };
  }

  expanded(id: string): ExpandedDistrict | null {
    return this.cache.get(id) ?? null;
  }
  districtIds(): string[] {
    return [...this.cache.keys()].sort();
  }
  ops(): GenerativeOp[] {
    return this.log.slice();
  }

  totalPopulation(): number {
    let p = 0;
    for (const id of this.districtIds()) p += unitScore(this.cache.get(id)!).population;
    return p;
  }

  // The geometry signature of the whole proposal, the value the client compares against to prove the
  // rendered city is the one the agent scored (the cross-runtime determinism gate, ADR-R23).
  signatureAll(): string {
    return this.districtIds()
      .map((id) => `${id}:${geometrySignature(this.cache.get(id)!)}`)
      .join("||");
  }

  score(kind: "units" | "sun" | "reach" | "traffic", districtId: string): ScoreResult {
    const ex = this.cache.get(districtId);
    if (!ex) return { ok: false, error: `no expanded district ${districtId}` };
    if (kind === "units") return { ok: true, score: unitScore(ex) };
    if (kind === "sun") {
      const s = this.scoreCtx.sun;
      if (!s) return { ok: false, error: "no sun context configured" };
      return { ok: true, score: sunScore(ex, s.region, s.occluders, s.spec, s.samples, s.resolution) };
    }
    if (kind === "reach") {
      const r = this.scoreCtx.reach;
      if (!r) return { ok: false, error: "no reach context configured" };
      return { ok: true, score: reachScore(ex, r.withinMinutes, r.walkSpeedMps) };
    }
    const t = this.scoreCtx.traffic;
    if (!t) return { ok: false, error: "no traffic context configured" };
    return { ok: true, score: trafficScore(ex, unitScore(ex).population, t) };
  }
}

export function withinTolerance(value: number, target: number, tolFrac: number): boolean {
  return Math.abs(value - target) <= target * tolFrac;
}
export function closerToTarget(next: number, prev: number, target: number): boolean {
  return Math.abs(next - target) < Math.abs(prev - target);
}
