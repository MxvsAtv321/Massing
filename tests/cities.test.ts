import { describe, it, expect } from "vitest";
import { cityFiles, cityDir, DEFAULT_CITY } from "../src/model/cities";

// The canonical data layout resolver (I1): data/cities/<id>/ with canonical filenames.
describe("cityFiles", () => {
  it("resolves the canonical layout under data/cities/<id>/", () => {
    const f = cityFiles("/root", "toronto");
    expect(f.footprints).toBe("/root/data/cities/toronto/footprints.geojson");
    expect(f.manifest).toBe("/root/data/cities/toronto/manifest.json");
    expect(f.network).toBe("/root/data/cities/toronto/network.json");
    expect(f.cordon).toBe("/root/data/cities/toronto/cordon.json");
    expect(f.counts).toBe("/root/data/cities/toronto/traffic-counts.json");
    expect(f.studyRegions).toBe("/root/data/cities/toronto/study-regions.json");
  });

  it("defaults to Toronto", () => {
    expect(DEFAULT_CITY).toBe("toronto");
    expect(cityFiles("/root")).toEqual(cityFiles("/root", "toronto"));
    expect(cityDir("/root")).toBe("/root/data/cities/toronto");
  });

  it("addresses a different city by id, the same canonical names", () => {
    expect(cityFiles("/root", "nyc").footprints).toBe("/root/data/cities/nyc/footprints.geojson");
    expect(cityFiles("/root", "nyc").manifest).toBe("/root/data/cities/nyc/manifest.json");
  });
});
