"use client";

import { useEffect, useMemo, useRef } from "react";
import { studyState } from "./studyStore";
import { sunAtMinutes } from "./sunInstant";
import { buildSamples, type SunProvider } from "../study/sampleWindow";
import {
  buildHeightfield,
  heightfieldSpecForBounds,
  type HeightfieldBuilding,
} from "../study/heightfield";
import { computeInsolation } from "../study/insolation";
import { meanSunHours } from "../study/sunHours";
import { defaultStudyConfig, type RegionField } from "../study/studyTypes";
import type { InsolationRequest } from "../study/insolationWorker";
import type { BuildingForScene } from "../mutation/building";
import type { ModelBounds } from "./types";

// Runs the sun-access study on demand (Unit 8, increment 8.3): builds the city
// heightfield, samples the bylaw window with the real sun, and computes the sun-hours
// field in a worker (off the frame loop), storing the result for the heatmap (8.4)
// and the net-new metric (8.5). Press "u" to run; the result and timing log to the
// console. Falls back to a main-thread compute if the worker cannot start, so the
// study still runs (with a one-off hitch) on any setup, and the log says which path
// ran (cf. the ADR-R01 fallback ethos).

// Heightfield resolution and region grid, tuned for an on-demand study (not per
// frame). Read the logged timing on device and adjust if the worker run is slow.
const CELL_M = 4; // heightfield cell size, metres
const REGION_RES = 128; // sun-hours field is REGION_RES x REGION_RES

export function StudyController({
  buildings,
  bounds,
  originLatLon,
}: {
  buildings: BuildingForScene[];
  bounds: ModelBounds;
  originLatLon: [number, number];
}) {
  const hfBuildings = useMemo<HeightfieldBuilding[]>(
    () => buildings.map((b) => ({ footprint: b.footprint, height: b.heightValue })),
    [buildings]
  );
  const spec = useMemo(
    () => heightfieldSpecForBounds(bounds.center, bounds.radius, CELL_M),
    [bounds]
  );

  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL("../study/insolationWorker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (e) {
      console.warn("[study] worker unavailable; computing on the main thread", e);
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const run = () => {
      const region = studyState.getRegion();
      const cfg = {
        ...defaultStudyConfig("webgpu"),
        isoDate: studyState.getDate(),
        resolution: REGION_RES,
      };
      const sun: SunProvider = (isoDate, min) => {
        const s = sunAtMinutes(originLatLon, isoDate, min);
        return { altitude: s.altitude, azimuth: s.azimuth, dir: s.dir };
      };
      const samples = buildSamples(cfg, sun);
      const field = buildHeightfield(hfBuildings, spec);

      studyState.setStatus("running");
      const t0 = performance.now();

      const done = (r: RegionField, path: string) => {
        const ms = performance.now() - t0;
        studyState.setField(r);
        studyState.setStatus("ready");
        console.log(
          `[study] ${ms.toFixed(0)}ms (${path}) mean ${meanSunHours(r).toFixed(
            2
          )}h of ${r.maxPossibleHours.toFixed(2)}h, ${samples.length} samples, ${
            r.width
          }x${r.height}`
        );
      };

      const worker = workerRef.current;
      if (worker) {
        const onMsg = (e: MessageEvent<RegionField>) => {
          worker.removeEventListener("message", onMsg);
          done(e.data, "worker");
        };
        worker.addEventListener("message", onMsg);
        const req: InsolationRequest = {
          field,
          region,
          resolution: REGION_RES,
          samples,
        };
        worker.postMessage(req, [field.maxH.buffer]);
      } else {
        done(computeInsolation(region, REGION_RES, field, samples), "main");
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "u") run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hfBuildings, spec, originLatLon]);

  return null;
}
