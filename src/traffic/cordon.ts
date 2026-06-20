import type { RoadNetwork } from "../network/types";
import { lonLatToEnu } from "../coords/enu";
import type { Place, CordonSide } from "./demand";

// Curated cordon gateway (data/cordon.json), an arterial crossing of the catchment
// boundary, given as lon/lat plus a label and side.
export type CordonGatewaySpec = {
  id: string;
  label: string;
  side: CordonSide;
  lonlat: [number, number];
};

export type CordonFile = {
  _note?: string;
  maxResolveMetres: number;
  gateways: CordonGatewaySpec[];
};

export type CordonResolution = {
  places: Place[];
  unresolved: { spec: CordonGatewaySpec; dist: number }[];
};

// Resolve each gateway to the nearest strongly-connected network node, reprojecting its
// lon/lat through the network's own origin (the shared ENU frame). The connector node is
// what Part 3 routes from and to, so a gateway that resolves is routable by construction.
// Gateways beyond maxResolveMetres are reported as unresolved (a mistyped or off-network
// coordinate), not silently snapped to something far away.
export function resolveCordon(network: RoadNetwork, file: CordonFile): CordonResolution {
  const [lon0, lat0] = network.originLatLon;
  const places: Place[] = [];
  const unresolved: { spec: CordonGatewaySpec; dist: number }[] = [];

  for (const spec of file.gateways) {
    const [ex, ey] = lonLatToEnu(spec.lonlat[0], spec.lonlat[1], lon0, lat0);

    let best = network.nodes[0];
    let bestDist = Infinity;
    for (const n of network.nodes) {
      const d = Math.hypot(n.enu[0] - ex, n.enu[1] - ey);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }

    if (!best || bestDist > file.maxResolveMetres) {
      unresolved.push({ spec, dist: bestDist });
      continue;
    }

    places.push({
      id: spec.id,
      label: spec.label,
      side: spec.side,
      centroidEnu: best.enu,
      connectorNodeId: best.id,
    });
  }

  return { places, unresolved };
}
