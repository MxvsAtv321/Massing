"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { studyState } from "./studyStore";
import { editRatios } from "./editRatios";
import { sunAtMinutes } from "./sunInstant";
import { buildSamples, type SunProvider } from "../study/sampleWindow";
import {
  buildHeightfield,
  heightfieldSpecForBounds,
  type HeightfieldBuilding,
} from "../study/heightfield";
import { computeInsolation } from "../study/insolation";
import { massingToHeightfieldBuildings } from "../generate/heightfieldFromMassing";
import { netNewShadow, NET_NEW_THRESHOLD_HOURS } from "../study/netNewShadow";
import {
  defaultStudyConfig,
  type AnalysisRegion,
  type RegionField,
} from "../study/studyTypes";
import type { InsolationRequest } from "../study/insolationWorker";
import type { BuildingForScene } from "../mutation/building";
import type { MassingPlacement } from "../generate/massing";
import type { ModelBounds } from "./types";

// The live sun-access loop (Unit 8, increment 8.5): the study re-runs on every
// committed height edit, off the main thread, and reports the net-new shadow an edit
// casts on the region against the unedited baseline. Raise a tower beside the park and
// its shadow falls across it as the panel ticks up the sunlight removed. The baseline
// (unedited city, current region and date) is cached and only recomputed when the
// region or date changes; an edit recomputes just the current field and diffs it.
// Press "u" to force a run. Falls back to a main-thread compute if the worker cannot
// start (cf. ADR-R01), so the loop holds on any setup.

const CELL_M = 4; // heightfield cell size, metres
const REGION_RES = 128; // sun-hours field is REGION_RES x REGION_RES

export function StudyController({
  buildings,
  generatedMassing,
  bounds,
  originLatLon,
  ianaZone,
}: {
  buildings: BuildingForScene[];
  generatedMassing: MassingPlacement[];
  bounds: ModelBounds;
  originLatLon: [number, number];
  ianaZone: string;
}) {
  const spec = useMemo(
    () => heightfieldSpecForBounds(bounds.center, bounds.radius, CELL_M),
    [bounds]
  );

  // Footprints with either base or live edited heights (base height times the
  // cluster's committed Y-scale). The edited field is what casts the new shadow.
  const hfBuildings = useMemo(
    () =>
      (edited: boolean): HeightfieldBuilding[] => {
        const real = buildings.map((b) => ({
          footprint: b.footprint,
          height: edited
            ? b.heightValue * editRatios.ratioFor(b.clusterId)
            : b.heightValue,
        }));
        // The generated proposal occludes the sun too, so the heatmap reflects the new block (G2).
        return generatedMassing.length > 0
          ? [...real, ...massingToHeightfieldBuildings(generatedMassing)]
          : real;
      },
    [buildings, generatedMassing]
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

  const baselineRef = useRef<{ key: string; field: RegionField } | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    const sun: SunProvider = (isoDate, min) => {
      const s = sunAtMinutes(originLatLon, isoDate, min, ianaZone);
      return { altitude: s.altitude, azimuth: s.azimuth, dir: s.dir };
    };

    // One sun-hours field for a heightfield. Worker first, main-thread fallback.
    const runInsolation = (
      field: ReturnType<typeof buildHeightfield>,
      region: AnalysisRegion,
      samples: ReturnType<typeof buildSamples>
    ): Promise<RegionField> =>
      new Promise((resolve) => {
        const worker = workerRef.current;
        if (!worker) {
          resolve(computeInsolation(region, REGION_RES, field, samples));
          return;
        }
        const onMsg = (e: MessageEvent<RegionField>) => {
          worker.removeEventListener("message", onMsg);
          resolve(e.data);
        };
        worker.addEventListener("message", onMsg);
        const req: InsolationRequest = {
          field,
          region,
          resolution: REGION_RES,
          samples,
        };
        worker.postMessage(req, [field.maxH.buffer]);
      });

    const runStudy = async () => {
      if (busyRef.current) {
        pendingRef.current = true;
        return;
      }
      busyRef.current = true;
      studyState.setStatus("running");

      const region = studyState.getRegion();
      const date = studyState.getDate();
      const cfg = { ...defaultStudyConfig("webgpu"), isoDate: date, resolution: REGION_RES };
      const samples = buildSamples(cfg, sun);
      const key = baselineKey(region, date);
      const t0 = performance.now();

      // Baseline is the unedited city for this region and date; recompute only when
      // those change, not on every edit.
      if (!baselineRef.current || baselineRef.current.key !== key) {
        const baseField = await runInsolation(
          buildHeightfield(hfBuildings(false), spec),
          region,
          samples
        );
        baselineRef.current = { key, field: baseField };
      }

      const current = await runInsolation(
        buildHeightfield(hfBuildings(true), spec),
        region,
        samples
      );
      const result = netNewShadow(
        baselineRef.current.field,
        current,
        NET_NEW_THRESHOLD_HOURS
      );

      studyState.setField(current);
      studyState.setResult(result);
      studyState.setStatus("ready");
      console.log(
        `[study] ${(performance.now() - t0).toFixed(0)}ms net-new ${result.netNewShadowHours.toFixed(
          2
        )}h, mean ${result.meanSunHours.toFixed(2)}h of ${current.maxPossibleHours.toFixed(2)}h`
      );

      busyRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void runStudy();
      }
    };

    runStudyRef.current = runStudy;

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "u") void runStudy();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hfBuildings, spec, originLatLon, ianaZone]);

  // Re-run on a committed edit: the edit store bumps version on every change, so wait
  // until the drag has ended (the commit) before recomputing, and skip the mount frame.
  const runStudyRef = useRef<() => void>(() => {});
  const lastVersion = useRef(editRatios.version());
  useFrame(() => {
    const v = editRatios.version();
    if (v !== lastVersion.current && editRatios.draggingCluster() === null) {
      lastVersion.current = v;
      runStudyRef.current();
    }
  });

  // Re-run when the generative proposal changes (key "g"): the city's massing changed, so the cached
  // baseline is stale; drop it and recompute the field with the proposal in it. Skip the mount pass so
  // load behaves as before (the study otherwise still waits for "u" or an edit).
  const genMounted = useRef(false);
  useEffect(() => {
    if (!genMounted.current) {
      genMounted.current = true;
      return;
    }
    baselineRef.current = null;
    runStudyRef.current();
  }, [generatedMassing]);

  return null;
}

function baselineKey(r: AnalysisRegion, date: string): string {
  return `${date}|${r.center[0]},${r.center[1]}|${r.halfExtents[0]},${r.halfExtents[1]}|${r.rotationRad}`;
}
