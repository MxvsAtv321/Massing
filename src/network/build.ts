import * as fs from "fs";
import type {
  RawNetworkFile,
  RoadNetwork,
  NetworkNode,
  NetworkEdge,
  NetworkProvenance,
} from "./types";
import { buildUndirectedSegments } from "./topology";
import { parseOneway, parseLanes, parseSpeedKph } from "./tags";
import { reprojectPolyline, polylineLengthEnu } from "./geometry";
import { analyzeConnectivity } from "./connectivity";

// Adjacency list: node id -> outgoing edge indices into the given edges array.
function buildAdjacency(
  nodes: NetworkNode[],
  edges: NetworkEdge[]
): Map<string, number[]> {
  const adjacency = new Map<string, number[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (let i = 0; i < edges.length; i++) {
    adjacency.get(edges[i].from)!.push(i);
  }
  return adjacency;
}

// Unique undirected centerline length: each two-way segment is one physical street, so
// its forward and backward edges must not be double-counted.
function centerlineMetres(edges: NetworkEdge[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const e of edges) {
    const lo = e.from < e.to ? e.from : e.to;
    const hi = e.from < e.to ? e.to : e.from;
    const key = `${e.osmWayId}:${lo}-${hi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += e.lengthMetres;
  }
  return total;
}

// ---------------------------------------------------------------------------
// parseRoadNetwork: pure function, no I/O. Reprojects against the city-model origin so
// the network shares the buildings' ENU frame exactly. Mirrors parseCityModel.
//
// The raw extract, clipped to a bounding box, always leaves stranded fringes: one-way
// streets and ramps whose return path falls outside the cordon (the Gardiner, Lake
// Shore, interchange ramps). The routable network is the largest strongly connected
// component; the rest is pruned and reported. Routing on a fragmented graph is
// meaningless (the gate enforces this).
// ---------------------------------------------------------------------------

export function parseRoadNetwork(
  raw: RawNetworkFile,
  originLatLon: [number, number]
): RoadNetwork {
  const [lon0, lat0] = originLatLon;
  const rawNodeById = new Map(raw.nodes.map((n) => [n.id, n]));

  const { segments, excludedDanglingWays } = buildUndirectedSegments(raw.nodes, raw.ways);

  // NetworkNodes are created only for nodes that become an edge endpoint.
  const nodes = new Map<string, NetworkNode>();
  const ensureNode = (osmId: number): NetworkNode => {
    const key = String(osmId);
    let node = nodes.get(key);
    if (!node) {
      const rn = rawNodeById.get(osmId)!;
      const enu = reprojectPolyline([[rn.lon, rn.lat]], lon0, lat0)[0];
      node = { id: key, osmNodeId: osmId, enu, degree: 0 };
      nodes.set(key, node);
    }
    return node;
  };

  const allEdges: NetworkEdge[] = [];
  let excludedZeroLength = 0;
  let undirectedSegments = 0;

  for (const seg of segments) {
    const lonlat = seg.nodeRefs.map((id) => {
      const rn = rawNodeById.get(id)!;
      return [rn.lon, rn.lat] as [number, number];
    });
    const enuFwd = reprojectPolyline(lonlat, lon0, lat0);
    const length = polylineLengthEnu(enuFwd);

    if (!(length > 0)) {
      excludedZeroLength++;
      continue;
    }
    undirectedSegments++;

    const fromOsm = seg.nodeRefs[0];
    const toOsm = seg.nodeRefs[seg.nodeRefs.length - 1];
    const direction = parseOneway(seg.tags, seg.roadClass);
    const lanes = parseLanes(seg.tags, seg.roadClass);
    const speed = parseSpeedKph(seg.tags, seg.roadClass);

    const provenance: NetworkProvenance = {
      source: raw.provenance.source,
      date: raw.provenance.retrievedDate,
      // OSM is community-surveyed; the sigma is a horizontal positional estimate, not
      // yet propagated into any Part 1 number (length uses the geometry directly).
      confidence: { kind: "estimated", sigma_m: 5 },
      defaulted: { lanes: lanes.defaulted, speed: speed.defaulted },
    };

    const makeEdge = (
      aOsm: number,
      bOsm: number,
      geom: [number, number][],
      oneway: boolean
    ): NetworkEdge => {
      const a = ensureNode(aOsm);
      const b = ensureNode(bOsm);
      return {
        id: `${seg.osmWayId}:${aOsm}->${bOsm}`,
        from: a.id,
        to: b.id,
        geometry: geom,
        lengthMetres: length,
        lanes: lanes.value,
        speedLimitKph: speed.value,
        roadClass: seg.roadClass,
        oneway,
        osmWayId: seg.osmWayId,
        provenance,
      };
    };

    const enuRev = [...enuFwd].reverse();

    if (direction === "forward") {
      allEdges.push(makeEdge(fromOsm, toOsm, enuFwd, true));
    } else if (direction === "reverse") {
      allEdges.push(makeEdge(toOsm, fromOsm, enuRev, true));
    } else {
      allEdges.push(makeEdge(fromOsm, toOsm, enuFwd, false));
      allEdges.push(makeEdge(toOsm, fromOsm, enuRev, false));
    }
  }

  const allNodes = [...nodes.values()];
  const preAdjacency = buildAdjacency(allNodes, allEdges);

  // Prune to the largest strongly connected component.
  const conn = analyzeConnectivity({
    nodes: allNodes,
    edges: allEdges,
    adjacency: preAdjacency,
  });
  const stranded = new Set(conn.strandedNodeIds);

  const keptNodes = allNodes.filter((n) => !stranded.has(n.id));
  const keptEdges = allEdges.filter(
    (e) => !stranded.has(e.from) && !stranded.has(e.to)
  );

  const adjacency = buildAdjacency(keptNodes, keptEdges);

  // Degree = in + out, over the kept graph.
  const degree = new Map<string, number>();
  for (const e of keptEdges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  for (const node of keptNodes) node.degree = degree.get(node.id) ?? 0;

  const network: RoadNetwork = {
    originLatLon,
    crsNote: `local ENU, metres, origin at [${lon0.toFixed(6)}, ${lat0.toFixed(
      6
    )}] (shared with city model)`,
    nodes: keptNodes,
    edges: keptEdges,
    adjacency,
    provenance: raw.provenance,
    coverage: {
      rawNodes: raw.nodes.length,
      rawWays: raw.ways.length,
      undirectedSegments,
      excludedZeroLength,
      excludedDanglingWays,
      graphNodesBeforePrune: allNodes.length,
      directedEdgesBeforePrune: allEdges.length,
      strandedNodes: stranded.size,
      strandedComponents: Math.max(0, conn.components - 1),
      graphNodes: keptNodes.length,
      directedEdges: keptEdges.length,
      centerlineKm: centerlineMetres(keptEdges) / 1000,
      connected: keptNodes.length > 0 && conn.largestComponentNodes === keptNodes.length,
    },
  };

  return network;
}

// ---------------------------------------------------------------------------
// loadRoadNetwork: file I/O wrapper around parseRoadNetwork. The origin is passed in by
// the caller (the city model), guaranteeing road and buildings share one frame.
// ---------------------------------------------------------------------------

export function loadRoadNetwork(
  networkPath: string,
  originLatLon: [number, number]
): RoadNetwork {
  const raw = JSON.parse(fs.readFileSync(networkPath, "utf8")) as RawNetworkFile;
  return parseRoadNetwork(raw, originLatLon);
}
