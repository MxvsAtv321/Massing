import { describe, it, expect } from "vitest";
import { cityFiles } from "../src/model/cities";
import { loadCityModel } from "../src/model/loadCityModel";
import { loadRoadNetwork } from "../src/network/build";
import { buildServerContext } from "../src/agent/serverContext";
import { toRoutableGraph } from "../src/traffic/routableGraph";
import { deriveCordon } from "../src/traffic/deriveCordon";
import { exampleScenario } from "../src/traffic/demand";
import type { ODNodeFlow } from "../src/traffic/assignment";
import { heightfieldSpecForBounds } from "../src/study/heightfield";
import { buildSamples } from "../src/study/sampleWindow";
import { defaultStudyConfig } from "../src/study/studyTypes";
import { sunAtMinutes } from "../src/render/sunInstant";
import { Sandbox } from "../src/agent/sandbox";
import { GenerativeOpSchema } from "../src/generate/op";
import { cityIdentitySignature } from "../src/model/identity";
import type { SunScore, UnitScore, ReachScore, TrafficScore } from "../src/score/types";

// The visual-invariance gate (V1, ADR-R29). For all three cities it freezes the geometry identity
// signature and all four consequence outputs, computed on a fixed canned proposal. The visual unit that
// follows (materials, silhouette, landmarks) must keep every one of these byte-identical: if a visual
// change moves the signature or one consequence, this test goes red and the change has crossed from
// appearance into identity. Recorded as the before-snapshot here, with no visual code yet.

type Frozen = {
  identitySig: string;
  sun: { mean: number; lit: number };
  units: { pop: number };
  reach: { worst: number; reached: number };
  traffic: { maxVC: number; congested: number };
};

const r = (x: number, d = 4) => Number(x.toFixed(d));
const op = (raw: unknown) => GenerativeOpSchema.parse(raw);

async function compute(cityId: string): Promise<Frozen> {
  const files = cityFiles(process.cwd(), cityId);
  const model = await loadCityModel(files.footprints, files.manifest);
  const { ctx, opts } = await buildServerContext(cityId);
  const network = loadRoadNetwork(files.network, model.originLatLon);

  let minE = 1e18, maxE = -1e18, minN = 1e18, maxN = -1e18;
  for (const b of model.buildings)
    for (const ring of b.footprint)
      for (const p of ring) {
        if (p[0] < minE) minE = p[0];
        if (p[0] > maxE) maxE = p[0];
        if (p[1] < minN) minN = p[1];
        if (p[1] > maxN) maxN = p[1];
      }
  const center: [number, number] = [(minE + maxE) / 2, (minN + maxN) / 2];
  const radius = Math.max(maxE - minE, maxN - minN) / 2;

  const occluders = model.buildings.map((b) => ({
    footprint: b.footprint,
    height: b.height.value,
    confidence: b.height.confidence.kind,
  }));
  const spec = heightfieldSpecForBounds(center, radius, 8);
  const region = {
    id: "r", name: "r", kind: "rect" as const,
    center, halfExtents: [120, 120] as [number, number], rotationRad: 0, source: "placed" as const,
  };
  const sun = (iso: string, min: number) => {
    const s = sunAtMinutes(model.originLatLon, iso, min, model.sources.ianaZone);
    return { altitude: s.altitude, azimuth: s.azimuth, dir: s.dir };
  };
  const samples = buildSamples({ ...defaultStudyConfig("webgpu"), isoDate: "2026-06-21" }, sun);

  const graph = toRoutableGraph(network);
  const places = deriveCordon(network);
  const connectorOf = new Map(places.map((p) => [p.id, p.connectorNodeId]));
  const baseOD: ODNodeFlow[] = exampleScenario(places)
    .map((f) => ({
      fromNodeId: connectorOf.get(f.fromPlaceId)!,
      toNodeId: connectorOf.get(f.toPlaceId)!,
      tripsPerHour: f.tripsPerHour,
    }))
    .filter((f) => f.fromNodeId != null && f.toNodeId != null);
  const trafficInputs = {
    edges: graph.edges.map(({ geometry, ...e }) => e),
    baseOD,
    gatewayNodeIds: [...new Set(places.map((p) => p.connectorNodeId))],
    districtNodeId: graph.nodes[0].id,
  };

  const sandbox = new Sandbox(ctx, opts, {
    sun: { region, occluders, spec, samples, resolution: 24 },
    reach: { withinMinutes: 5 },
    traffic: trafficInputs,
  });
  sandbox.applyOp(op({ op: "DefineDistrict", district: "d1", region: { kind: "rect", center, halfExtents: [120, 120], rotationRad: 0 }, seed: 7 }));
  sandbox.applyOp(op({ op: "LayStreets", district: "d1", pattern: "grid", blockSizeM: 90, primaryAxis: { kind: "bearing", deg: 0 }, carFree: true }));
  sandbox.applyOp(op({ op: "FillBlocks", district: "d1", program: "residential", target: { unitsPerHa: 600 }, heightEnvelope: { minStoreys: 8, maxStoreys: 8 }, coverage: 0.45 }));
  sandbox.applyOp(op({ op: "PlaceOpenSpace", district: "d1", where: "central", areaM2: 8000 }));

  const su = sandbox.score("sun", "d1");
  const un = sandbox.score("units", "d1");
  const re = sandbox.score("reach", "d1");
  const tr = sandbox.score("traffic", "d1");
  if (!su.ok || !un.ok || !re.ok || !tr.ok) throw new Error(`scoring failed for ${cityId}`);
  const s = su.score as SunScore, u = un.score as UnitScore, rc = re.score as ReachScore, t = tr.score as TrafficScore;

  return {
    identitySig: cityIdentitySignature(
      model.buildings.map((b) => ({ id: b.id, footprint: b.footprint, heightValue: b.height.value }))
    ),
    sun: { mean: r(s.meanSunHours), lit: r(s.sunlitFraction) },
    units: { pop: u.population },
    reach: { worst: r(rc.worstCaseMinutes, 2), reached: r(rc.reachedFraction) },
    traffic: { maxVC: r(t.maxVC), congested: r(t.congestedFraction) },
  };
}

// Frozen baselines, recorded in V1 with no visual code in place. The visual unit (materials, silhouette,
// landmarks) must keep every one of these byte-identical. If a visual commit moves a value, this test
// goes red and the change has crossed from appearance into identity (ADR-R29).
const FROZEN: Record<string, Frozen> = {
  toronto: { identitySig: "ed5f4d1a", sun: { mean: 3.7737, lit: 0.8073 }, units: { pop: 2300 }, reach: { worst: 2.14, reached: 1 }, traffic: { maxVC: 1, congested: 0.0165 } },
  nyc: { identitySig: "0b18f214", sun: { mean: 1.2766, lit: 0.5365 }, units: { pop: 2258 }, reach: { worst: 2.14, reached: 1 }, traffic: { maxVC: 1, congested: 0.1759 } },
  mexico: { identitySig: "3a892d60", sun: { mean: 6.4251, lit: 0.9931 }, units: { pop: 1533 }, reach: { worst: 2.14, reached: 1 }, traffic: { maxVC: 1, congested: 0.0638 } },
};

describe("visual invariance: geometry and consequences unchanged by appearance (ADR-R29)", () => {
  for (const city of Object.keys(FROZEN)) {
    it(`${city} matches its frozen baseline`, async () => {
      expect(await compute(city)).toEqual(FROZEN[city]);
    }, 60000);
  }
});
