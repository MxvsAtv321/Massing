import type { BuildingForScene } from "../mutation/building";

// Slim client payload resolved at build time from the baked city model.
export type CityPayload = {
  buildings: BuildingForScene[];
  originLatLon: [number, number]; // stored [lon, lat] (loader convention)
  metresPerStorey: number;
};

export type ModelBounds = {
  center: [number, number]; // ENU [east, north] metres
  radius: number; // half the larger extent, metres
};
