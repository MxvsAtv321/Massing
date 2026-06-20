"use client";

import { useState, useCallback, useMemo } from "react";
import {
  exampleScenario,
  validateFlow,
  type ODFlow,
  type Place,
  type FlowValidation,
} from "./demand";

// Client state for the demand scenario. Pure user input: there is no path from buildings
// or edits into this hook, by design (the honest boundary, ADR-006/008).
export type DemandScenarioState = {
  flows: ODFlow[];
  pendingOrigin: string | null;
  pendingDestination: string | null;
  setOrigin: (id: string | null) => void;
  setDestination: (id: string | null) => void;
  onGatewayClick: (id: string) => void; // two-click origin-then-destination
  addPendingFlow: (tripsPerHour: number) => FlowValidation;
  removeFlow: (id: string) => void;
  loadExample: () => void;
  clearFlows: () => void;
  clearPending: () => void;
};

export function useDemandScenario(places: Place[]): DemandScenarioState {
  const [flows, setFlows] = useState<ODFlow[]>([]);
  const [pendingOrigin, setPendingOrigin] = useState<string | null>(null);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);

  const placeIds = useMemo(() => new Set(places.map((p) => p.id)), [places]);

  const onGatewayClick = useCallback(
    (id: string) => {
      if (pendingOrigin === null) {
        setPendingOrigin(id);
        setPendingDestination(null);
        return;
      }
      if (pendingDestination === null && id !== pendingOrigin) {
        setPendingDestination(id);
        return;
      }
      // Both set, or origin re-clicked: restart with a fresh origin.
      setPendingOrigin(id);
      setPendingDestination(null);
    },
    [pendingOrigin, pendingDestination]
  );

  const addPendingFlow = useCallback(
    (tripsPerHour: number): FlowValidation => {
      if (pendingOrigin === null || pendingDestination === null) {
        return { ok: false, reason: "select an origin and a destination gateway" };
      }
      const candidate = {
        fromPlaceId: pendingOrigin,
        toPlaceId: pendingDestination,
        tripsPerHour,
      };
      const v = validateFlow(candidate, placeIds);
      if (!v.ok) return v;

      setFlows((prev) => {
        const id = `f:${pendingOrigin}->${pendingDestination}`;
        const next: ODFlow = { id, ...candidate };
        const idx = prev.findIndex((f) => f.id === id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = next;
          return copy;
        }
        return [...prev, next];
      });
      setPendingOrigin(null);
      setPendingDestination(null);
      return { ok: true };
    },
    [pendingOrigin, pendingDestination, placeIds]
  );

  const removeFlow = useCallback((id: string) => {
    setFlows((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const loadExample = useCallback(() => {
    setFlows(exampleScenario(places));
    setPendingOrigin(null);
    setPendingDestination(null);
  }, [places]);

  const clearFlows = useCallback(() => setFlows([]), []);

  const clearPending = useCallback(() => {
    setPendingOrigin(null);
    setPendingDestination(null);
  }, []);

  return {
    flows,
    pendingOrigin,
    pendingDestination,
    setOrigin: setPendingOrigin,
    setDestination: setPendingDestination,
    onGatewayClick,
    addPendingFlow,
    removeFlow,
    loadExample,
    clearFlows,
    clearPending,
  };
}
