import { describe, it, expect } from "vitest";
import { resolveHeight } from "../src/ingest/heightTiers";
import { buildFootprints, buildCityManifest, type RawBuilding } from "../src/ingest/snapshot";
import { parseCityModel } from "../src/model/loadCityModel";

describe("resolveHeight tiers", () => {
  it("prefers measured, then osm height, then levels", () => {
    expect(resolveHeight({ measuredHeight: 50, osmHeight: 30, osmLevels: 5 })?.tier).toBe("measured");
    expect(resolveHeight({ osmHeight: 30, osmLevels: 5 })?.tier).toBe("osm-height");
    expect(resolveHeight({ osmLevels: 5 })?.tier).toBe("osm-levels");
    expect(resolveHeight({ osmLevels: 5 })?.height).toBe(15); // 5 levels * 3 m
  });

  it("returns null when no height is available, excluded never defaulted", () => {
    expect(resolveHeight({})).toBeNull();
    expect(resolveHeight({ measuredHeight: 0, osmLevels: 0 })).toBeNull();
  });
});

// A small square ring around a lon/lat.
function ring(lon: number, lat: number): [number, number][] {
  const d = 0.0005;
  return [
    [lon, lat],
    [lon + d, lat],
    [lon + d, lat + d],
    [lon, lat + d],
    [lon, lat],
  ];
}

describe("ingestion produces a loader-valid snapshot with correct provenance (the gate)", () => {
  const buildings: RawBuilding[] = [
    { id: "m1", ringLonLat: ring(-74.01, 40.71), measuredHeight: 80 }, // measured tier
    { id: "l1", ringLonLat: ring(-74.012, 40.711), osmLevels: 10 }, // levels-derived, the weak tier
    { id: "x1", ringLonLat: ring(-74.013, 40.712) }, // no height: excluded
  ];
  const { fc, stats } = buildFootprints(buildings);
  const manifest = buildCityManifest({
    cityId: "nyc-test",
    displayName: "Test NYC",
    ianaZone: "America/New_York",
    datasetName: "OpenStreetMap buildings",
    datasetUrl: "https://example.com",
    retrievedDate: "2026-06-28",
  });

  it("excludes the no-height building and tiers the rest", () => {
    expect(stats.included).toBe(2);
    expect(stats.excludedNoHeight).toBe(1);
    expect(stats.byTier.measured).toBe(1);
    expect(stats.byTier["osm-levels"]).toBe(1);
  });

  it("loads through parseCityModel with the right per-building confidence", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = parseCityModel(fc as any, manifest);
    expect(model.buildings.length).toBe(2);
    const m = model.buildings.find((b) => b.id === "m1")!;
    const l = model.buildings.find((b) => b.id === "l1")!;
    expect(m.height.value).toBe(80);
    expect(m.height.confidence.kind).toBe("measured"); // measured tier -> high confidence
    expect(l.height.value).toBe(30); // 10 levels * 3 m
    expect(l.height.confidence.kind).toBe("estimated"); // levels tier -> low confidence
  });
});
