"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { buildFlowRibbons, groupSegments } from "./flowGeometry";
import type { RoutableEdge } from "../traffic/routableGraph";
import type { FlowResult } from "../traffic/assignment";

// Congestion overlay: vertex-colored ribbons over the grey roads, colored by mid v/c and
// faded where the band is wide. Unlit (meshBasicMaterial) so the data colors read true
// regardless of the sun. Rebuilt when the flow result changes.
export function FlowOverlay({
  edges,
  flow,
  visible,
}: {
  edges: RoutableEdge[];
  flow: FlowResult | null;
  visible: boolean;
}) {
  const geo = useMemo(
    () => (flow ? buildFlowRibbons(groupSegments(edges, flow)) : null),
    [edges, flow]
  );

  useEffect(() => () => geo?.dispose(), [geo]);

  if (!visible || !geo) return null;

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors transparent opacity={0.92} />
    </mesh>
  );
}
