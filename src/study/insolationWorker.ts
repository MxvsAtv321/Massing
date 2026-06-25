import { computeInsolation } from "./insolation";
import type { Heightfield } from "./heightfield";
import type { AnalysisRegion, RegionField, SunHoursSample } from "./studyTypes";

// The sun-access study off the main thread (Unit 8, increment 8.3). The heightfield
// is built on the main thread (it needs the footprints) and transferred in; the
// worker runs the pure raymarch and transfers the sun-hours field back. Keeping the
// accumulation here means the study never touches the render budget, on demand or on
// every edit (8.5), no matter how many samples or how fine the region.

export type InsolationRequest = {
  field: Heightfield;
  region: AnalysisRegion;
  resolution: number;
  samples: SunHoursSample[];
};

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InsolationRequest>) => void) | null;
  postMessage(message: RegionField, transfer?: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const { field, region, resolution, samples } = e.data;
  const result = computeInsolation(region, resolution, field, samples);
  ctx.postMessage(result, [result.hours.buffer]);
};
