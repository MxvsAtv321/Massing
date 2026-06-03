import { describe, it, expect } from "vitest";
import { computeShadowBand } from "../src/honesty/band";
import { computeBreakdown, buildClusterProvenances } from "../src/honesty/confidence";
import { buildFooterLines, type FooterInput } from "../src/honesty/footer";
import { MIN_SUN_ALTITUDE_DEG } from "../src/solar/sun";
import type { Building, ClusterIndexEntry } from "../src/model/types";

// ─── computeShadowBand ────────────────────────────────────────────────────────

describe("computeShadowBand", () => {
  it("returns correct mid, low, high at alt=45", () => {
    // L = 100 / tan(45°) = 100, spread = 5 / tan(45°) = 5
    const band = computeShadowBand(100, 5, 45);
    expect(band).not.toBeNull();
    expect(band!.mid).toBe(100);
    expect(band!.low).toBe(95);
    expect(band!.high).toBe(105);
  });

  it("band widens as altitude drops", () => {
    const high = computeShadowBand(100, 2, 45);
    const low = computeShadowBand(100, 2, 20);
    expect(high).not.toBeNull();
    expect(low).not.toBeNull();
    const widthHigh = high!.high - high!.low;
    const widthLow = low!.high - low!.low;
    expect(widthLow).toBeGreaterThan(widthHigh);
  });

  it("returns whole metres only (no fractional part)", () => {
    const band = computeShadowBand(73, 3.7, 33);
    expect(band).not.toBeNull();
    expect(band!.mid).toBe(Math.round(band!.mid));
    expect(band!.low).toBe(Math.round(band!.low));
    expect(band!.high).toBe(Math.round(band!.high));
    expect(Number.isInteger(band!.mid)).toBe(true);
    expect(Number.isInteger(band!.low)).toBe(true);
    expect(Number.isInteger(band!.high)).toBe(true);
  });

  it("returns null below MIN_SUN_ALTITUDE_DEG", () => {
    expect(computeShadowBand(100, 5, MIN_SUN_ALTITUDE_DEG - 1)).toBeNull();
    expect(computeShadowBand(100, 5, 0)).toBeNull();
    expect(computeShadowBand(100, 5, -5)).toBeNull();
  });

  it("returns non-null at exactly MIN_SUN_ALTITUDE_DEG", () => {
    expect(computeShadowBand(100, 5, MIN_SUN_ALTITUDE_DEG)).not.toBeNull();
  });
});

// ─── computeBreakdown ─────────────────────────────────────────────────────────

describe("computeBreakdown", () => {
  it("counts measured / estimated / hypothetical correctly", () => {
    const buildings = [
      { confidenceKind: "measured" as const },
      { confidenceKind: "measured" as const },
      { confidenceKind: "measured" as const },
      { confidenceKind: "estimated" as const },
      { confidenceKind: "estimated" as const },
      { confidenceKind: "hypothetical" as const },
    ];
    const result = computeBreakdown(buildings);
    expect(result.measured).toBe(3);
    expect(result.estimated).toBe(2);
    expect(result.hypothetical).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    const result = computeBreakdown([]);
    expect(result.measured).toBe(0);
    expect(result.estimated).toBe(0);
    expect(result.hypothetical).toBe(0);
  });
});

// ─── buildFooterLines ─────────────────────────────────────────────────────────

describe("buildFooterLines", () => {
  const FIXTURE: FooterInput = {
    dataset: "City of Toronto 3D Massing 2025",
    vintage: "2025",
    retrievedDate: "2025-12-05",
    license: "Open Government Licence - Toronto",
    accuracyDisclaimer: "City Planning provides massing data for information purposes only.",
    bandScopeNote: "v1 band is height-only; footprint error excluded.",
    breakdown: { measured: 3, estimated: 2, hypothetical: 1 },
    hypotheticalCount: 1,
    torontoDateTimeStr: "2026-06-03 2:32 PM EDT",
    sunAltDeg: 45.2,
    sunAzDeg: 180.5,
    isUsable: true,
  };

  it("includes the dataset name", () => {
    const lines = buildFooterLines(FIXTURE);
    expect(lines.some((l) => l.includes("City of Toronto 3D Massing 2025"))).toBe(true);
  });

  it("includes the license string", () => {
    const lines = buildFooterLines(FIXTURE);
    expect(lines.some((l) => l.includes("Open Government Licence - Toronto"))).toBe(true);
  });

  it("includes the breakdown counts", () => {
    const lines = buildFooterLines(FIXTURE);
    const joined = lines.join(" ");
    expect(joined).toContain("3 measured");
    expect(joined).toContain("2 estimated");
    expect(joined).toContain("1 hypothetical");
  });

  it("includes the do-not-model summary line", () => {
    const lines = buildFooterLines(FIXTURE);
    expect(lines.some((l) => l.toLowerCase().includes("not modeled"))).toBe(true);
  });

  it("includes the band scope note", () => {
    const lines = buildFooterLines(FIXTURE);
    expect(lines.some((l) => l.includes("v1 band is height-only"))).toBe(true);
  });

  it("includes the hypothetical-structure note when count > 0", () => {
    const lines = buildFooterLines(FIXTURE);
    expect(lines.some((l) => l.includes("hypothetical") && l.includes("you added"))).toBe(true);
  });

  it("omits the hypothetical-structure note when count is 0", () => {
    const lines = buildFooterLines({ ...FIXTURE, hypotheticalCount: 0, breakdown: { measured: 3, estimated: 2, hypothetical: 0 } });
    expect(lines.some((l) => l.includes("you added"))).toBe(false);
  });
});

// ─── buildClusterProvenances (mixed-source detection) ─────────────────────────

function makeBuilding(
  id: string,
  clusterId: string,
  heightM: number,
  confidenceKind: "measured" | "estimated",
  sigma: number,
  heightSrc: string | null
): Building {
  return {
    id,
    footprint: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    height: {
      value: heightM,
      source: "Test Dataset",
      date: "2025",
      confidence:
        confidenceKind === "measured"
          ? { kind: "measured", sigma_m: sigma }
          : { kind: "estimated", sigma_m: sigma },
    },
    baseElevation: {
      value: 0,
      source: "flat-ground",
      date: "2025",
      confidence: { kind: "measured", sigma_m: 0 },
    },
    origin: "toronto-open-data",
    clusterId,
    isTallestInCluster: false,
    heightSrc,
  };
}

describe("buildClusterProvenances", () => {
  it("picks the tallest member and flags mixed when sources differ", () => {
    const tall = makeBuilding("b1", "c0", 100, "measured", 0.5, "Lidar-Derived");
    const short = makeBuilding("b2", "c0", 30, "estimated", 5.0, "Site Plan");

    const clusters: Record<string, ClusterIndexEntry> = {
      c0: {
        clusterId: "c0",
        representativeHeight_m: 100,
        memberIds: ["b1", "b2"],
        tallestMemberId: "b1",
      },
    };

    const result = buildClusterProvenances([tall, short], clusters);

    expect(result.c0.representativeHeight_m).toBe(100);
    expect(result.c0.heightSrc).toBe("Lidar-Derived");
    expect(result.c0.confidenceKind).toBe("measured");
    expect(result.c0.sigma_m).toBe(0.5);
    expect(result.c0.mixedSources).toBe(true);
    expect(result.c0.memberCount).toBe(2);
  });

  it("reports mixedSources=false when all members share the same confidence kind", () => {
    const b1 = makeBuilding("b1", "c1", 100, "measured", 0.5, "Lidar-Derived");
    const b2 = makeBuilding("b2", "c1", 60, "measured", 0.5, "Lidar-Derived");

    const clusters: Record<string, ClusterIndexEntry> = {
      c1: {
        clusterId: "c1",
        representativeHeight_m: 100,
        memberIds: ["b1", "b2"],
        tallestMemberId: "b1",
      },
    };

    const result = buildClusterProvenances([b1, b2], clusters);
    expect(result.c1.mixedSources).toBe(false);
  });

  it("handles a single-member cluster with no mixing", () => {
    const b = makeBuilding("b1", "c2", 50, "estimated", 5.0, "Site Plan");
    const clusters: Record<string, ClusterIndexEntry> = {
      c2: {
        clusterId: "c2",
        representativeHeight_m: 50,
        memberIds: ["b1"],
        tallestMemberId: "b1",
      },
    };
    const result = buildClusterProvenances([b], clusters);
    expect(result.c2.mixedSources).toBe(false);
    expect(result.c2.heightSrc).toBe("Site Plan");
    expect(result.c2.confidenceKind).toBe("estimated");
  });
});
