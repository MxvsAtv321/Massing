import { describe, it, expect } from "vitest";
import {
  buildHeightfield,
  heightfieldSpecForBounds,
  type HeightfieldBuilding,
  type OccluderConfidence,
} from "../src/study/heightfield";
import { computeShadowLedger, sunConfidence } from "../src/study/shadowLedger";
import type { AnalysisRegion, SunHoursSample } from "../src/study/studyTypes";

// A small region at the origin.
const REGION: AnalysisRegion = {
  id: "r",
  name: "r",
  kind: "rect",
  center: [0, 0],
  halfExtents: [5, 5],
  rotationRad: 0,
  source: "placed",
};

// A low southern sun (altitude 20 deg). It marches toward -north (south), so an occluder placed south
// of the region casts its shadow north onto the region. dir is Three space: x east, y up, z = -north.
function southSun(altDeg: number): SunHoursSample {
  const a = (altDeg * Math.PI) / 180;
  return {
    minutesOfDay: 720,
    altitudeDeg: altDeg,
    azimuthDeg: 180,
    dir: [0, Math.sin(a), Math.cos(a)],
    contributes: true,
    weightHours: 1,
  };
}

// A tall block just south of the region, with a given height provenance.
function occluder(conf: OccluderConfidence): HeightfieldBuilding {
  return {
    footprint: [[[-20, -30], [20, -30], [20, -10], [-20, -10], [-20, -30]]],
    height: 100,
    confidence: conf,
  };
}

const SPEC = heightfieldSpecForBounds([0, -10], 60, 4);
const SAMPLE = southSun(20);
const ledgerFor = (occ: HeightfieldBuilding[]) =>
  computeShadowLedger(REGION, 8, buildHeightfield(occ, SPEC), [SAMPLE]);

describe("shadow ledger", () => {
  it("a fully sunlit region reads high confidence, nothing shadows it", () => {
    const led = ledgerFor([]);
    expect(led.lostTotal).toBe(0);
    expect(sunConfidence(led).class).toBe("high");
  });

  it("a region shadowed by a measured occluder reads high confidence", () => {
    const led = ledgerFor([occluder("measured")]);
    expect(led.lostTotal).toBeGreaterThan(0); // it is genuinely shadowed
    expect(led.lostUntrusted).toBe(0);
    expect(sunConfidence(led).class).toBe("high");
  });

  it("a region shadowed by an estimated occluder reads low confidence", () => {
    const led = ledgerFor([occluder("estimated")]);
    expect(led.lostTrusted).toBe(0);
    expect(led.lostUntrusted).toBeGreaterThan(0);
    expect(sunConfidence(led).class).toBe("low");
  });

  it("generated occluders, the proposal's own towers, are trusted", () => {
    const led = ledgerFor([occluder("generated")]);
    expect(led.lostUntrusted).toBe(0);
    expect(sunConfidence(led).class).toBe("high");
  });

  it("confidence flips with provenance on identical geometry (the I7 diagnostic in miniature)", () => {
    const measured = sunConfidence(ledgerFor([occluder("measured")]));
    const estimated = sunConfidence(ledgerFor([occluder("estimated")]));
    expect(measured.class).toBe("high");
    expect(estimated.class).toBe("low");
    // Same lost sun, different trust: the model keys on provenance, not on the shadow geometry.
    expect(estimated.lostHours).toBeCloseTo(measured.lostHours, 6);
  });
});
