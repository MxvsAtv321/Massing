# Traffic Subsystem Architecture (the wind tunnel)

Status: build spine for the traffic subsystem. Read this after `docs/architecture.md`
and `docs/decisions.md`. This doc frames the honest boundary that governs everything in
`src/network/` and the later `src/traffic/`, then specifies Part 1, the network
foundation. ADR-006 and ADR-007 in `docs/decisions.md` are the settled decisions this
doc expands on.

---

## 0. The one idea

Treat traffic like a wind tunnel. You do not ask a wind tunnel to invent the wind. You
set the wind yourself, then watch honestly how the shape in front of it behaves, and you
trust the tunnel because it has been calibrated against real measurements.

For us:

- The user sets the demand. Demand is the wind.
- We simulate the flow. Flow is the physics of that wind moving through the real street
  network.
- We validate the flow against real measured counts. That is the calibration.
- We never predict the demand a development creates. The tunnel does not invent wind.

This is the absolute boundary. It is what lets traffic exist in a tool whose brand is
refusing to fake behavioral consequences.

---

## 1. The honest boundary, stated precisely

Three categories, and which side of the line each sits on.

- Demand: how many trips want to go from where to where, and when. This is behavioral.
  We do not predict it. In particular we never predict induced or generated demand from
  a development ("a 40-storey tower adds N car trips"). When demand appears in the
  product (Part 2) it is an explicit scenario the user dials in, badged as a user
  assumption everywhere, exactly like a user-added building is badged hypothetical.
- Flow: given a demand, how traffic distributes across the network, the volumes and
  speeds on each street, where it backs up. This is physics on a fixed graph. We
  simulate it (Part 3) and we put a confidence band on it.
- Counts: real measured vehicle counts from Toronto open data. These are facts with a
  source and a date. They are the calibration target (Part 4) and may be shown as a
  factual readout, never as a prediction.

The product sentence we are allowed to say:

> Under a demand scenario you set, here is how flow behaves on the real street network,
> and here is how our simulator scores against measured counts.

The product sentence we are never allowed to say:

> This development will cause this much traffic.

### Relationship to the existing do-NOT-measure list

`src/honesty/doNotMeasure.ts` lists "Traffic change" as a refused behavioral
consequence, because trip generation and routing require behavioral models not grounded
in geometry. That entry stays true and stays refused: we do not predict the demand a
development creates. The wind tunnel does not contradict it. It adds a different,
honest capability next to it: flow under a demand the user assumes, validated against
real counts. The do-NOT-measure entry will be refined to draw this distinction in the
part that actually ships demand (Part 2), not before, because until then there is no
demand or flow in the product and refining the wording early would describe something
that does not exist yet.

---

## 2. Build arc

Four parts. This document ships with Part 1. Later parts get their own design notes.

1. Network foundation (this part). A typed, provenance-stamped, gated, aligned, quietly
   rendered directed road graph in the city ENU frame. No vehicles, no demand, no flow,
   no routing UI.
2. Demand as a scenario. UI to set origin-destination demand across a small set of
   zones and the cordon, every input badged as a user assumption. No prediction of
   demand from massing.
3. Flow simulation. Assign the user's demand onto the network and simulate flow physics.
   Starting point is static macroscopic assignment with a volume-delay relationship
   (travel time rises with volume over capacity), producing per-edge volumes and speeds
   with a confidence band. The cordon implied by Part 1's catchment carries the
   external trips in and out.
4. Validation and animation. Score simulated flow against real Toronto open-data counts
   (the falsification anchor, the analogue of `known-heights.json` for routing), and
   bring the live flow animation onto the network stage built in Part 1. Counts are a
   factual readout; simulated flow is badged scenario-conditional.

---

## 3. Subsystem architecture

```
src/network/     graph foundation (Part 1)
  types.ts         NetworkNode, NetworkEdge, RoadNetwork, RoadClass, provenance, coverage
  tags.ts          OSM tag parsing: road class, oneway, lanes, speed
  topology.ts      split ways into segments at intersections
  geometry.ts      ENU reprojection of polylines, ENU length
  connectivity.ts  strongly connected components, stranded-node analysis
  shortestPath.ts  Dijkstra over edge length (gate utility, and Part 3 later)
  build.ts         parseRoadNetwork (pure) + loadRoadNetwork (fs wrapper)

src/traffic/     later: demand scenario (Part 2), flow assignment (Part 3),
                 count validation (Part 4)

src/scene/       RoadNetwork overlay + roadGeometry + NetworkReadout (Part 1)

data/network.json        baked OSM drivable snapshot (raw lon/lat + tags + provenance)
data/known-routes.json   routing, oneway, and alignment ground truth (Part 1 gate)
data/traffic-counts.*    later: measured counts for Part 4 validation

scripts/fetch-network.ts   Overpass acquisition, emits data/network.json
scripts/verify-network.ts  the gate (mirrors scripts/verify-heights.ts)
```

The network graph is problem-agnostic infrastructure, like the city model. It knows
nothing about demand or flow.

### Why flow is not a Consequence plugin

The existing `Consequence` interface in `docs/architecture.md` section 8 returns a band
computed from geometry alone (`compute(model)` to a `Band`). Shadow and FAR fit because
they are pure functions of the buildings. Flow does not fit: it depends on a user-set
demand scenario, not on geometry alone, so a `compute(model)` signature would be a lie
about where the number comes from. Traffic therefore lives in its own `src/traffic/`
subsystem with its own honesty contract (user-set demand in, simulated flow out,
validated against counts), and does not implement `Consequence`. Keeping it out of that
interface is the structural enforcement of the honest boundary.

---

## 4. Part 1: the network foundation

### 4.1 Coordinate frame, the trap that would corrupt everything

The network must live in the exact same local ENU frame as the city model. Two ways to
get this wrong, both silent:

- Computing distance in EPSG:3857 metres. Web Mercator inflates horizontal distance by
  about 1.38x at Toronto's latitude, so every edge length, and so every future travel
  time, would be about 38 percent too long.
- Using a different origin than the city model, so the road grid and the buildings drift
  apart on screen and a road no longer lines up with the building beside it.

Both are eliminated by construction. The network snapshot stores raw lon/lat (like
`stlawrence.geojson` stores raw 3857). At load, `parseRoadNetwork` reprojects every node
through `src/coords/enu.ts` (`lonLatToEnu`) using the city model's own computed origin,
the same origin the buildings used. Road and building therefore share one frame exactly.
The gate asserts this (section 4.6, alignment).

### 4.2 Catchment bounding box

WGS84 lon/lat, deliberately larger than the building clip so traffic can enter and leave
through the cordon arterials (the cordon reused in Part 3):

```
south 43.6400   north 43.6540   west -79.3850   east -79.3650
```

About 1.6 km east-west by 1.55 km north-south. It contains the building clip
(roughly lon -79.381..-79.372, lat 43.642..43.650) with 300 to 400 m of margin out to
the natural cordon arterials: Queen St E to the north, Parliament St to the east, Yonge
and Bay to the west, and the rail corridor, The Esplanade, and Lake Shore to the south.

### 4.3 Data acquisition: Overpass query in TypeScript

`scripts/fetch-network.ts` issues one Overpass QL query for the catchment, normalizes
the response to the few tags we use, stamps provenance, and writes `data/network.json`.
Run by a developer to refresh the snapshot; the app never touches the network at build
or runtime, exactly like the building snapshot. Provenance baked into the file records
the source (OpenStreetMap, ODbL, attribution to OpenStreetMap contributors), the verbatim
query, the retrieval date, the bounding box, and the drivable filter.

The choice of Overpass plus TypeScript over osmnx is recorded in ADR-007: it keeps one
toolchain, `tsx` is already present, and it gives exact control over reusing
`src/coords/enu.ts` and the city origin so alignment holds by construction. The gate
guarantees correctness either way.

### 4.4 Drivable filter (what is in and out)

Mirrors osmnx's `drive` network type.

- In: `motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `unclassified`,
  `residential`, `living_street`, and their `_link` ramps.
- Out: `footway`, `cycleway`, `path`, `pedestrian`, `steps`, `track`, `bridleway`,
  `corridor`, `service` (including parking aisles, driveways, alleys), `construction`,
  `proposed`, `raceway`, `busway`, `bus_guideway`, `platform`, `elevator`, `escalator`.
  Also excluded: `area=yes` (pedestrian plazas), `access=private` or `access=no`,
  `motor_vehicle=no`, `motorcar=no`.
- Service roads are excluded. This keeps the network to the public drivable grid. If
  Part 3 finds a needed connection missing because of this, the decision is revisited
  there, not silently.

### 4.5 The typed graph

Types in `src/network/types.ts`, in the spirit of `Provenance<T>` and reusing
`Confidence` from `src/model/types.ts`.

- `NetworkNode`: graph id (the OSM node id as a string), source OSM node id, ENU
  position `[east, north]`, and degree (in plus out).
- `NetworkEdge`: id, from, to, ordered ENU polyline geometry from-to, `lengthMetres`
  computed from the ENU geometry, lanes, speed limit in kph, road class, a oneway flag,
  the source OSM way id, and provenance (source OpenStreetMap, a date, a confidence, and
  a `defaulted` marker recording where lanes or speed were filled from a class default
  because the OSM tag was missing).
- `RoadNetwork`: nodes, edges, an adjacency list (node id to outgoing edge indices) for
  fast traversal, the origin lon/lat shared with the city model, a crs note, the
  provenance manifest, and coverage stats.

Directedness. A two-way street becomes two opposing directed edges. A oneway street
(`oneway=yes`, `true`, or `1`) becomes one directed edge; `oneway=-1` becomes one
directed edge with the geometry reversed. When the oneway tag is absent, the default is
two-way, except `junction=roundabout` and `motorway`/`motorway_link`, which default to
oneway. Getting this wrong makes all later routing nonsense, so the gate spot-checks it.

Topology. OSM ways thread through many nodes. The graph vertices are intersections and
dead ends: a node is a vertex if it is a way endpoint, is shared by more than one
drivable way, or is a self-intersection within a way. Ways are split into edges between
consecutive vertices, with the intermediate shape kept as the edge polyline.

### 4.6 The gate: `scripts/verify-network.ts`

Mirrors `scripts/verify-heights.ts`: loads the real baked snapshot, prints a table,
exits non-zero on any failure. `data/known-routes.json` is the routing ground truth, the
analogue of `data/known-heights.json`, hand-authored against a map and independent of the
graph. Checks:

1. Connectivity. One dominant strongly connected component holding essentially the whole
   graph (at least 98 percent of nodes); stranded nodes reported. Routing on a fragmented
   graph is meaningless.
2. Geometry. Each edge's ENU length matches the independent geodesic (haversine) length
   of the same lon/lat polyline within tolerance; zero-length edges fail; absurd edges
   are flagged.
3. Oneway correctness. Known oneway streets are directed correctly: an edge exists in the
   expected direction and the reverse is absent.
4. Known routes. Shortest-path distances between named intersections reproduce
   hand-verified ground truth within tolerance.
5. Alignment. Known intersection coordinates reprojected through the city origin land on
   a graph node within a few metres; the network origin equals the city origin; and a
   road node sits where expected relative to a known building, proving road and building
   co-registration.

The honesty readout in the UI shows the live-computed connectivity criterion (single
component, or N stranded), which is the one gate check computable in the browser. The
full length, oneway, and known-route checks run offline via `pnpm verify:network`. The
readout is labeled so this is honest and not theater.

### 4.7 Render

Restrained on purpose. The network is the stage the flow animation arrives on in Part 4,
so it is quiet, not garish, and matches the existing scene's visual language: clean
ground-level ribbons just above the flat ground plane, subtly differentiated by road
class (arterials a little wider and lighter than local streets), receiving the buildings'
shadows so the overlay ties into the shadow hero rather than floating over it. A small
honesty readout panel shows node count, directed edge count, total network kilometres,
connectivity status, and the gate line.

### 4.8 Non-goals for Part 1

No vehicles, no demand, no flow, no routing UI, no behavioral modeling, and no change to
the do-NOT-measure list yet. Just a correct, aligned, gated, quietly rendered network and
this document framing the honest boundary for everything after it.
