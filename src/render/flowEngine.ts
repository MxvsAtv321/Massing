import {
  buildAdjacency,
  type RoutableEdge,
  type RoutableGraph,
} from "../traffic/routableGraph";
import { solveFlowLite, type ODNodeFlow } from "../traffic/assignment";
import {
  clusterDeltaTrips,
  buildingDemandFlows,
  combineDemand,
} from "../traffic/reactiveDemand";
import { clampCongestion } from "./flowField";
import type { ReactiveFlowInputs } from "./types";

// Client-side flow re-solver (5e). Holds the routable graph and the cordon baseline,
// and on each city edit re-solves the BPR flow with the edited buildings' generated
// trips folded in, then publishes per-street congestion and per-agent-edge speed.
// Pure imperative store: consumers subscribe and read on notify (cf. editRatios), no
// React render per solve. One assignOnce per edit, in the browser, no round-trip.

export type EditedCluster = { clusterId: string; ratio: number };

export type FlowEngine = {
  resolve: (edited: EditedCluster[]) => void;
  subscribe: (cb: () => void) => () => void;
  streetCongestion: () => number[] | null; // parallel to streets, null before first solve
  edgeSpeeds: () => number[] | null; // parallel to agent edges (kph), null before first solve
};

export function createFlowEngine(
  inputs: ReactiveFlowInputs,
  clusterRepHeights: Map<string, number>,
  metresPerStorey: number
): FlowEngine {
  // The solver never reads geometry, so rebuild routable edges with an empty path.
  const edges: RoutableEdge[] = inputs.edges.map((e) => ({
    ...e,
    geometry: [] as [number, number][],
  }));
  const graph: RoutableGraph = {
    nodes: [],
    edges,
    adjacency: buildAdjacency([], edges),
  };
  const freeKph = new Map<string, number>();
  for (const e of edges) freeKph.set(e.id, e.speedLimitKph);

  let streetCongestion: number[] | null = null;
  let edgeSpeeds: number[] | null = null;
  const listeners = new Set<() => void>();

  function resolve(edited: EditedCluster[]): void {
    const buildingFlows: ODNodeFlow[] = [];
    for (const { clusterId, ratio } of edited) {
      const nodeId = inputs.clusterNodeId[clusterId];
      if (!nodeId) continue;
      const repH = clusterRepHeights.get(clusterId) ?? 0;
      const delta = clusterDeltaTrips(repH, ratio, metresPerStorey);
      const flows = buildingDemandFlows(nodeId, delta, inputs.gatewayNodeIds);
      for (const f of flows) buildingFlows.push(f);
    }
    const flow = solveFlowLite(graph, combineDemand(inputs.baseOD, buildingFlows));

    streetCongestion = inputs.streetEdgeIds.map((ids) => {
      let vc = 0;
      for (const id of ids) {
        const f = flow.get(id);
        if (f && f.vc > vc) vc = f.vc;
      }
      return clampCongestion(vc);
    });
    edgeSpeeds = inputs.agentEdgeIds.map((id) => {
      const f = flow.get(id);
      return f ? f.speedKph : freeKph.get(id) ?? 0;
    });
    for (const l of listeners) l();
  }

  return {
    resolve,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    streetCongestion: () => streetCongestion,
    edgeSpeeds: () => edgeSpeeds,
  };
}
