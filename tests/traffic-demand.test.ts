import { describe, it, expect } from "vitest";
import {
  validateFlow,
  summariseConservation,
  exampleScenario,
  MAX_TRIPS_PER_HOUR,
  type Place,
  type CordonSide,
} from "../src/traffic/demand";

function place(id: string, side: CordonSide): Place {
  return { id, label: id, side, centroidEnu: [0, 0], connectorNodeId: id };
}

const PLACES: Place[] = [
  place("e1", "E"),
  place("e2", "E"),
  place("w1", "W"),
  place("w2", "W"),
  place("n1", "N"),
  place("s1", "S"),
];
const IDS = new Set(PLACES.map((p) => p.id));

describe("validateFlow", () => {
  it("accepts a bounded whole-trip flow between two distinct known places", () => {
    expect(validateFlow({ fromPlaceId: "e1", toPlaceId: "w1", tripsPerHour: 800 }, IDS)).toEqual({ ok: true });
  });

  it("rejects unknown places", () => {
    expect(validateFlow({ fromPlaceId: "x", toPlaceId: "w1", tripsPerHour: 1 }, IDS).ok).toBe(false);
    expect(validateFlow({ fromPlaceId: "e1", toPlaceId: "x", tripsPerHour: 1 }, IDS).ok).toBe(false);
  });

  it("rejects a self-loop", () => {
    expect(validateFlow({ fromPlaceId: "e1", toPlaceId: "e1", tripsPerHour: 1 }, IDS).ok).toBe(false);
  });

  it("rejects negative, over-max, and non-integer trips", () => {
    expect(validateFlow({ fromPlaceId: "e1", toPlaceId: "w1", tripsPerHour: -5 }, IDS).ok).toBe(false);
    expect(validateFlow({ fromPlaceId: "e1", toPlaceId: "w1", tripsPerHour: MAX_TRIPS_PER_HOUR + 1 }, IDS).ok).toBe(false);
    expect(validateFlow({ fromPlaceId: "e1", toPlaceId: "w1", tripsPerHour: 12.5 }, IDS).ok).toBe(false);
  });

  it("accepts zero trips", () => {
    expect(validateFlow({ fromPlaceId: "e1", toPlaceId: "w1", tripsPerHour: 0 }, IDS).ok).toBe(true);
  });
});

describe("summariseConservation", () => {
  it("tallies generated and attracted per place and flags imbalance", () => {
    const flows = [
      { id: "a", fromPlaceId: "e1", toPlaceId: "w1", tripsPerHour: 300 },
      { id: "b", fromPlaceId: "w1", toPlaceId: "e1", tripsPerHour: 100 },
    ];
    const c = summariseConservation(PLACES, flows);
    expect(c.totalTrips).toBe(400);
    const e1 = c.perPlace.find((p) => p.placeId === "e1")!;
    expect(e1).toEqual({ placeId: "e1", generated: 300, attracted: 100 });
    expect(c.balanced).toBe(false); // e1 sends 300 but receives 100
  });

  it("reports balanced when every place's inflow equals its outflow", () => {
    const flows = [
      { id: "a", fromPlaceId: "e1", toPlaceId: "w1", tripsPerHour: 300 },
      { id: "b", fromPlaceId: "w1", toPlaceId: "e1", tripsPerHour: 300 },
    ];
    expect(summariseConservation(PLACES, flows).balanced).toBe(true);
  });
});

describe("exampleScenario", () => {
  const flows = exampleScenario(PLACES);

  it("builds symmetric cross-cordon pairs (2 E-W pairs + 1 N-S pair = 6 flows)", () => {
    expect(flows).toHaveLength(6);
  });

  it("produces only valid flows", () => {
    for (const f of flows) expect(validateFlow(f, IDS)).toEqual({ ok: true });
  });

  it("is per-place balanced", () => {
    expect(summariseConservation(PLACES, flows).balanced).toBe(true);
  });
});
