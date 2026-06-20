"use client";

import { useMemo } from "react";
import {
  buildAdjacency,
  type RoutableNode,
  type RoutableEdge,
  type RoutableGraph,
} from "./routableGraph";
import { assignWithBand, type FlowResult, type ODNodeFlow } from "./assignment";
import type { ODFlow, Place } from "./demand";

// Runs the flow assignment on the client when the demand scenario changes. The graph is
// small, so live recompute keeps the wind tunnel interactive. Returns null when disabled
// or when there is no demand to assign. Pure consumption of demand + network: no path
// from buildings to flow (the honest boundary).
export function useFlow(
  nodes: RoutableNode[],
  edges: RoutableEdge[],
  gateways: Place[],
  flows: ODFlow[],
  enabled: boolean
): FlowResult | null {
  const graph = useMemo<RoutableGraph>(
    () => ({ nodes, edges, adjacency: buildAdjacency(nodes, edges) }),
    [nodes, edges]
  );

  const od = useMemo<ODNodeFlow[]>(() => {
    const connectorOf = new Map(gateways.map((g) => [g.id, g.connectorNodeId]));
    return flows
      .map((f) => ({
        fromNodeId: connectorOf.get(f.fromPlaceId),
        toNodeId: connectorOf.get(f.toPlaceId),
        tripsPerHour: f.tripsPerHour,
      }))
      .filter(
        (f): f is ODNodeFlow => f.fromNodeId !== undefined && f.toNodeId !== undefined
      );
  }, [gateways, flows]);

  return useMemo(
    () => (enabled && od.length > 0 ? assignWithBand(graph, od) : null),
    [enabled, graph, od]
  );
}
