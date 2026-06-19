import { describe, it, expect } from "vitest";
import { parseRoadClass, parseOneway, parseLanes, parseSpeedKph } from "../src/network/tags";
import type { RawWayTags } from "../src/network/types";

function tags(p: Partial<RawWayTags>): RawWayTags {
  return {
    highway: "residential",
    name: null,
    oneway: null,
    lanes: null,
    maxspeed: null,
    junction: null,
    ...p,
  };
}

describe("parseRoadClass", () => {
  it("maps base highway types", () => {
    expect(parseRoadClass("primary")).toBe("primary");
    expect(parseRoadClass("residential")).toBe("residential");
    expect(parseRoadClass("living_street")).toBe("living_street");
  });

  it("maps _link ramps to their base class", () => {
    expect(parseRoadClass("motorway_link")).toBe("motorway");
    expect(parseRoadClass("primary_link")).toBe("primary");
  });

  it("returns null for non-drivable or unknown types", () => {
    expect(parseRoadClass("footway")).toBeNull();
    expect(parseRoadClass("cycleway")).toBeNull();
    expect(parseRoadClass("")).toBeNull();
  });
});

describe("parseOneway", () => {
  it("treats yes/true/1 as forward", () => {
    expect(parseOneway(tags({ oneway: "yes" }), "residential")).toBe("forward");
    expect(parseOneway(tags({ oneway: "true" }), "residential")).toBe("forward");
    expect(parseOneway(tags({ oneway: "1" }), "residential")).toBe("forward");
  });

  it("treats -1 as reverse", () => {
    expect(parseOneway(tags({ oneway: "-1" }), "residential")).toBe("reverse");
  });

  it("treats no/absent as both directions", () => {
    expect(parseOneway(tags({ oneway: "no" }), "residential")).toBe("both");
    expect(parseOneway(tags({ oneway: null }), "residential")).toBe("both");
  });

  it("defaults roundabouts to forward when untagged", () => {
    expect(parseOneway(tags({ oneway: null, junction: "roundabout" }), "tertiary")).toBe("forward");
  });

  it("defaults motorways to forward when untagged", () => {
    expect(parseOneway(tags({ oneway: null }), "motorway")).toBe("forward");
  });

  it("lets an explicit oneway=no override the motorway default", () => {
    expect(parseOneway(tags({ oneway: "no" }), "motorway")).toBe("both");
  });
});

describe("parseLanes", () => {
  it("parses the lanes tag", () => {
    expect(parseLanes(tags({ lanes: "3" }), "primary")).toEqual({ value: 3, defaulted: false });
  });

  it("takes the first integer from a list value", () => {
    expect(parseLanes(tags({ lanes: "2;3" }), "primary").value).toBe(2);
  });

  it("falls back to a class default and flags it", () => {
    expect(parseLanes(tags({ lanes: null }), "residential")).toEqual({ value: 1, defaulted: true });
    expect(parseLanes(tags({ lanes: "0" }), "primary")).toEqual({ value: 2, defaulted: true });
  });
});

describe("parseSpeedKph", () => {
  it("parses a plain kph value", () => {
    expect(parseSpeedKph(tags({ maxspeed: "50" }), "secondary")).toEqual({ value: 50, defaulted: false });
  });

  it("parses a km/h suffix", () => {
    expect(parseSpeedKph(tags({ maxspeed: "40 km/h" }), "residential").value).toBe(40);
  });

  it("converts mph to kph", () => {
    // 30 mph * 1.609344 = 48.28 -> 48
    expect(parseSpeedKph(tags({ maxspeed: "30 mph" }), "primary").value).toBe(48);
  });

  it("falls back to a class default and flags it", () => {
    expect(parseSpeedKph(tags({ maxspeed: null }), "residential")).toEqual({ value: 40, defaulted: true });
  });
});
