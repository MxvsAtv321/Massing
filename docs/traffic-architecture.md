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
real counts. Now that demand ships (Part 2), the do-NOT-measure entry is refined to draw
this distinction: induced travel demand (the trips a development generates) stays
refused, and the demand shown is named as a user-set scenario, not a prediction.

---

## 2. Build arc

Four parts. Parts 1 to 3 are detailed here; Part 4 gets its own design notes.

1. Network foundation (this part). A typed, provenance-stamped, gated, aligned, quietly
   rendered directed road graph in the city ENU frame. No vehicles, no demand, no flow,
   no routing UI.
2. Demand as a scenario (this part now). UI to set origin-destination through-traffic
   demand between cordon gateways, every input badged as a user assumption, set
   explicitly (not via the LLM), never derived from massing. Drawn as desire lines, not
   street flow. Detailed in section 5.
3. Flow simulation (this part now). Assign the user's demand onto the network and
   simulate congested flow physics: incremental static assignment with a BPR volume-delay
   relationship (travel time rises with volume over capacity), producing per-edge volumes
   and speeds with a confidence band from capacity uncertainty. Scenario-conditional, not
   yet validated against counts. Detailed in section 6.
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

---

## 5. Part 2: demand as a user-set scenario

This is the "set the wind" half of the wind tunnel. The user defines the traffic demand
as an explicit scenario; the tool never invents it. No flow, routing, counts, or
animation here (those are Parts 3 and 4). Part 2 produces a valid, gated, Part-3-ready
origin-destination demand scenario and an honest way to set and see it.

### 5.1 Scope: cordon-only

Demand is origin-destination through-traffic between cordon gateways, the points where
the catchment's arterials cross the boundary. Demand visibly enters and leaves at the
edge and is never tied to a building, which keeps the honest boundary crisp. Internal
trip generators (trips to or from a clicked point, for instance at a new development) are
deferred to a later part, because a generator placed at a new tower visually flirts with
"the building creates demand" even when the number stays user-set.

### 5.2 The honest boundary, structurally enforced

- Demand is a user assumption. Every trip number is set by the user, badged as a scenario
  assumption, provenance-stamped (`DemandProvenance`, kind `user-scenario`), never a model
  output.
- Never predicted from massing. There is no code path from buildings or edits to demand;
  `src/traffic/` does not depend on the massing or edit layers.
- Set explicitly, not via the LLM. Demand is numbers the user dials, so the model never
  interprets or invents demand (ADR-008). This is deliberately unlike the massing layer,
  which uses the LLM, because demand is exactly the thing we refuse to let a model produce.
- Desire lines, not flow. Demand is drawn as straight origin-to-destination arcs between
  gateways (intent), explicitly not routed onto streets. Street flow arrives in Part 3 and
  looks different on purpose, so the two are never confused on screen.

### 5.3 Cordon gateways

Curated in `data/cordon.json` (the major arterial crossings of the boundary, by side),
the same hand-authored pattern as `data/known-routes.json`. At load,
`src/traffic/cordon.ts` `resolveCordon` reprojects each gateway lon/lat through the
network's own origin and snaps it to the nearest strongly connected network node, so every
gateway is routable in Part 3 by construction. The south edge is mostly pruned waterfront,
so it may carry few or no gateways; through-traffic is dominated by the east-west and
north-south arterials.

### 5.4 The demand model

`src/traffic/demand.ts` (pure): `Place` (a resolved gateway with its connector node),
`ODFlow` (`fromPlaceId`, `toPlaceId`, `tripsPerHour`), `DemandScenario` (flows plus
provenance). Helpers validate a flow (bounded non-negative integer trips, distinct
endpoints, known places), summarise conservation (trips generated versus attracted per
gateway), and build a balanced example peak scenario for a "load example" button. The
demand state lives in a client hook (`useDemandScenario`), mirroring the massing edit
layer.

### 5.5 Render and controls

A Demand toggle (alongside Roads and Quality) reveals the demand layer and panel; building
editing stays independent. `DemandLayer` draws clickable gateway markers at the cordon and
the desire lines as cool-toned translucent arcs raised above the ground, contrasting the
warm-grey roads, width by trips. `DemandControls` is a dark-glass panel to pick an
origin-destination pair, set bounded trips per hour, list and remove flows, load the
example, and clear, with the disclosure that demand is an assumption the user sets and the
tool never predicts the demand a development creates.

### 5.6 The gate

`scripts/verify-demand.ts` is a structural gate (demand is an assumption, so there is no
falsification oracle; the gate proves the scenario is well-formed and Part-3-ready against
the real network). It asserts every gateway resolves to a strongly-connected node within
`maxResolveMetres`, the connector nodes are distinct, the through directions (east and
west) are present, and the example scenario is valid and conserved.

### 5.7 Non-goals for Part 2

No flow simulation, routing or assignment, traffic counts, or animation (Parts 3 and 4).
No internal trip generators. No LLM involvement in demand. No change to the shadow export
hero beyond keeping the "not modeled" wording accurate.

---

## 6. Part 3: flow simulation

The physics half of the wind tunnel: assign the user's demand onto the network and
simulate congested flow, producing per-edge volumes and speeds with a confidence band.
This is where dialing the demand makes streets fill and slow. No animation yet (Part 4);
Part 3 shows the static flow result as colored streets.

### 6.1 The honest boundary holds

Flow is physics we simulate on a fixed network given the demand the user set. It is
scenario-conditional, never a prediction of demand: `src/traffic/assignment.ts` consumes
the demand scenario and the network, never the buildings. Flow is not a geometry-derived
`Consequence` (it depends on user-set demand, not geometry alone), so it stays in
`src/traffic/` with its own contract. Validation against real Toronto counts is Part 4,
so Part 3 flow is badged "simulated, not yet validated against counts."

### 6.2 Assignment

Incremental static assignment with a BPR volume-delay function. The demand is loaded in K
increments; each increment is routed on the current shortest-time paths (Dijkstra weighted
by current edge travel time), volumes accumulate, and edge times are then updated by
`t = t0 * (1 + alpha * (v / c)^beta)` (alpha 0.15, beta 4). Incremental assignment gives
the congestion feedback that makes the tunnel meaningful, adding demand slows roads and
reroutes traffic, without a full Frank-Wolfe equilibrium solver. The approximation is
disclosed. Free-flow time is `lengthMetres / (speedLimitKph / 3.6)`; per-direction
capacity is `directedLanes * perLaneCapacity(roadClass)`, with `directedLanes` equal to
`lanes` for a oneway and `round(lanes / 2)` for a two-way street (a disclosed assumption).

### 6.3 The confidence band

Capacity is the most uncertain input, especially where Part 1 had to default the OSM
`lanes` tag (the `defaulted` honesty flag on each edge). The band comes from a Monte Carlo
over capacity: the assignment runs once at nominal capacity (the mid) plus several
seeded-perturbed runs with per-edge multiplicative capacity noise, wider for `defaulted`
edges. The per-edge band is the volume range across the ensemble, so it is genuinely wider
where the underlying data was weaker. Scope, stated like the height-only shadow band: the
band reflects capacity and congestion-response uncertainty; route choice is assumed
shortest-time and is not in the band; demand is exact because the user set it; flow is not
validated against real counts (Part 4).

### 6.4 Render and gate

Flow is computed client-side for interactivity (the graph is small) and gated server-side
by `scripts/verify-flow.ts`, which runs the real engine on the real network and the
example demand and asserts trip conservation, flow conservation at nodes, demand
satisfaction, band ordering, free-flow sanity, and determinism. The flow overlay recolors
the streets by congestion (green to red on mid v/c) and fades links where the band is
wide, so low-confidence links literally look uncertain, tying the rendering back to Part
1's data-quality flag. A banded readout reports vehicle-km and congested links with ranges
and the scope disclosure.

### 6.5 Non-goals for Part 3

No moving-vehicle animation and no validation against real counts (both Part 4). No full
user-equilibrium solver. No turn delays, signals, or time-of-day dynamics. No demand
prediction. Flow stays out of the geometry `Consequence` interface.
