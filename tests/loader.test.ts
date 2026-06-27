import { describe, it, expect } from "vitest";
import { parseCityModel } from "../src/model/loadCityModel";
import type { SourceManifest } from "../src/model/types";

// ---------------------------------------------------------------------------
// Minimal valid manifest
// ---------------------------------------------------------------------------

const BASE_MANIFEST: SourceManifest = {
  dataset: "Test Dataset",
  datasetUrl: "https://example.com",
  license: "Test",
  vintage: "2025",
  retrievedDate: "2025-01-01",
  sourceCrs: "EPSG:3857",
  accuracyDisclaimer: "",
  heightField: "AVG_HEIGHT",
  groundField: "SURF_ELEV",
  heightMslField: "HEIGHT_MSL",
  artifactFilter: { field: "SURF_ELEV", value: 130.07, epsilon: 0.01 },
  sourceField: "HEIGHT_SRC",
  heightAccuracyBySource: {
    "Lidar-Derived": { kind: "measured", sigma_m: 0.5 },
    "Site Plan": { kind: "estimated", sigma_m: 5.0 },
  },
  defaultHeightAccuracy: { kind: "estimated", sigma_m: 5.0 },
  metresPerStorey: 3.0,
  ianaZone: "America/Toronto",
  bandScopeNote: "",
};

// A valid 3D-coordinates polygon ring in the Toronto 3857 area.
// x ≈ -8 836 700, y ≈ 5 411 919 (from the real dataset).
const X0 = -8_836_700;
const Y0 = 5_411_919;

function makeRing(dx: number, dy: number): number[][] {
  return [
    [X0, Y0, 0],
    [X0 + dx, Y0, 0],
    [X0 + dx, Y0 + dy, 0],
    [X0, Y0 + dy, 0],
    [X0, Y0, 0],
  ];
}

function makeFeature(props: Record<string, unknown>, ring = makeRing(10, 10)) {
  return {
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [ring] },
    properties: { id: "f1", AVG_HEIGHT: 20, SURF_ELEV: 80, HEIGHT_MSL: 100, HEIGHT_SRC: "Lidar-Derived", ...props },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFC(features: any[]) {
  return { type: "FeatureCollection" as const, features };
}

// ---------------------------------------------------------------------------
// Artifact filter
// ---------------------------------------------------------------------------

describe("artifact filter", () => {
  it("excludes a feature with SURF_ELEV == 130.07 and increments excludedArtifact", () => {
    const fc = makeFC([makeFeature({ SURF_ELEV: 130.07, HEIGHT_MSL: 150.07 })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    expect(model.buildings).toHaveLength(0);
    expect(model.coverage.excludedArtifact).toBe(1);
    expect(model.coverage.included).toBe(0);
  });

  it("excludes within epsilon (130.075)", () => {
    const fc = makeFC([makeFeature({ SURF_ELEV: 130.075, HEIGHT_MSL: 150.075 })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    expect(model.coverage.excludedArtifact).toBe(1);
  });

  it("does not exclude SURF_ELEV 130.09 (outside epsilon)", () => {
    const fc = makeFC([makeFeature({ SURF_ELEV: 130.09, HEIGHT_MSL: 150.09 })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    expect(model.coverage.excludedArtifact).toBe(0);
    expect(model.coverage.included).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Missing height
// ---------------------------------------------------------------------------

describe("missing height", () => {
  it("excludes a feature with no AVG_HEIGHT and increments excludedMissingHeight", () => {
    const fc = makeFC([makeFeature({ AVG_HEIGHT: null })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    expect(model.buildings).toHaveLength(0);
    expect(model.coverage.excludedMissingHeight).toBe(1);
  });

  it("excludes a feature with non-finite AVG_HEIGHT", () => {
    const fc = makeFC([makeFeature({ AVG_HEIGHT: "N/A" })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    expect(model.coverage.excludedMissingHeight).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Per-source confidence
// ---------------------------------------------------------------------------

describe("per-source confidence", () => {
  it("uses Lidar-Derived sigma for a Lidar-Derived feature", () => {
    const fc = makeFC([makeFeature({ HEIGHT_SRC: "Lidar-Derived" })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    const b = model.buildings[0];
    expect(b.height.confidence.kind).toBe("measured");
    expect((b.height.confidence as { sigma_m: number }).sigma_m).toBe(0.5);
  });

  it("uses Site Plan sigma for a Site Plan feature", () => {
    const fc = makeFC([makeFeature({ HEIGHT_SRC: "Site Plan" })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    const b = model.buildings[0];
    expect(b.height.confidence.kind).toBe("estimated");
    expect((b.height.confidence as { sigma_m: number }).sigma_m).toBe(5.0);
  });

  it("falls back to defaultHeightAccuracy for '3D Model' source", () => {
    const fc = makeFC([makeFeature({ HEIGHT_SRC: "3D Model" })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    const b = model.buildings[0];
    expect(b.height.confidence.kind).toBe(BASE_MANIFEST.defaultHeightAccuracy.kind);
    expect((b.height.confidence as { sigma_m: number }).sigma_m).toBe(
      BASE_MANIFEST.defaultHeightAccuracy.sigma_m
    );
  });

  it("falls back to defaultHeightAccuracy for unknown source", () => {
    const fc = makeFC([makeFeature({ HEIGHT_SRC: "Photogrammetrics" })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    const b = model.buildings[0];
    expect((b.height.confidence as { sigma_m: number }).sigma_m).toBe(
      BASE_MANIFEST.defaultHeightAccuracy.sigma_m
    );
  });

  it("falls back to defaultHeightAccuracy when HEIGHT_SRC is null", () => {
    const fc = makeFC([makeFeature({ HEIGHT_SRC: null })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    const b = model.buildings[0];
    expect((b.height.confidence as { sigma_m: number }).sigma_m).toBe(
      BASE_MANIFEST.defaultHeightAccuracy.sigma_m
    );
  });
});

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

describe("manifest validation", () => {
  it("throws when defaultHeightAccuracy.sigma_m is missing", () => {
    const badManifest = {
      ...BASE_MANIFEST,
      defaultHeightAccuracy: { kind: "estimated" } as any,
    };
    const fc = makeFC([makeFeature({})]);
    expect(() => parseCityModel(fc, badManifest)).toThrow(/sigma_m/);
  });

  it("throws when defaultHeightAccuracy.sigma_m is null", () => {
    const badManifest = {
      ...BASE_MANIFEST,
      defaultHeightAccuracy: { kind: "estimated", sigma_m: null } as any,
    };
    const fc = makeFC([makeFeature({})]);
    expect(() => parseCityModel(fc, badManifest)).toThrow(/sigma_m/);
  });

  it("throws when heightField is missing", () => {
    const badManifest = { ...BASE_MANIFEST, heightField: "" };
    const fc = makeFC([makeFeature({})]);
    expect(() => parseCityModel(fc, badManifest)).toThrow(/heightField/);
  });
});

// ---------------------------------------------------------------------------
// HEIGHT_MSL unpopulated
// ---------------------------------------------------------------------------

describe("HEIGHT_MSL unpopulated", () => {
  it("counts features with HEIGHT_MSL == 0 as heightMslUnpopulated, does not exclude", () => {
    const fc = makeFC([makeFeature({ HEIGHT_MSL: 0, SURF_ELEV: 0 })]);
    const model = parseCityModel(fc, BASE_MANIFEST);
    expect(model.coverage.heightMslUnpopulated).toBe(1);
    expect(model.coverage.included).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MultiPolygon explode
// ---------------------------------------------------------------------------

describe("MultiPolygon explosion", () => {
  it("explodes a 2-ring MultiPolygon into two buildings with suffixed ids", () => {
    const ringA = makeRing(10, 10);
    const ringB = makeRing(10, 10).map(([x, y, z]) => [x + 100, y + 100, z]);
    const feature = {
      type: "Feature" as const,
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: [[ringA], [ringB]],
      },
      properties: {
        id: "multi1",
        AVG_HEIGHT: 30,
        SURF_ELEV: 80,
        HEIGHT_MSL: 110,
        HEIGHT_SRC: "Lidar-Derived",
      },
    };
    const model = parseCityModel(makeFC([feature]), BASE_MANIFEST);
    expect(model.buildings).toHaveLength(2);
    const ids = model.buildings.map((b) => b.id).sort();
    expect(ids).toEqual(["multi1-0", "multi1-1"]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end scale guard: footprint size in ENU must be true ground metres
// ---------------------------------------------------------------------------

describe("E2E scale guard", () => {
  it("a footprint 1000 3857-units wide at Toronto latitude spans ~724 m ENU, not 1000 m", () => {
    // At y = 5 411 919 (Toronto), cos(lat) ≈ 0.724, so 1000 3857-x-units ≈ 724 m ground.
    // If the loader incorrectly recentered in 3857, the east span would be ~1000 m.
    const ring = makeRing(1000, 10); // 1000 3857-units wide
    const feature = {
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [ring] },
      properties: {
        id: "scale_test",
        AVG_HEIGHT: 20,
        SURF_ELEV: 80,
        HEIGHT_MSL: 100,
        HEIGHT_SRC: "Lidar-Derived",
      },
    };
    const model = parseCityModel(makeFC([feature]), BASE_MANIFEST);
    expect(model.buildings).toHaveLength(1);

    const ring0 = model.buildings[0].footprint[0];
    const eastCoords = ring0.map((pt) => pt[0]);
    const eastSpan = Math.max(...eastCoords) - Math.min(...eastCoords);

    // True ground span: 1000 * cos(43.65°) ≈ 723-725 m
    expect(eastSpan).toBeGreaterThan(700);
    expect(eastSpan).toBeLessThan(750);

    // Explicitly not the raw 3857 width (which would be ~1000 m if wrongly recentered)
    expect(eastSpan).toBeLessThan(950);
  });
});
