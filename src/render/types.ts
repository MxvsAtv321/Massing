import type { BuildingForScene } from "../mutation/building";

// One drivable street centerline, deduped from the directed road graph.
export type StreetSegment = {
  path: [number, number][]; // ENU [east, north] polyline
  lanes: number;
  roadClass: string;
};

// Slim client payload resolved at build time from the baked city model.
export type CityPayload = {
  buildings: BuildingForScene[];
  streets: StreetSegment[];
  originLatLon: [number, number]; // stored [lon, lat] (loader convention)
  metresPerStorey: number;
};

export type ModelBounds = {
  center: [number, number]; // ENU [east, north] metres
  radius: number; // half the larger extent, metres
};
