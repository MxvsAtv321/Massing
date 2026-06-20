# Architecture Decision Log

Each record is a decision that is settled. Reopen one only with a new ADR that supersedes it. Design rationale lives in `docs/architecture.md`; this file is the decisions, dated and terse.

---

## ADR-001: One neighborhood, St. Lawrence / St. James Park

Status: Accepted
Date: 2026-06-02

Context: v1 demos on one recognizable Toronto neighborhood. Judges are Waterloo-region housing experts watching a pitch. The five-second moment is a shadow falling on a real public park beside real towers. The site needs measured heights, recognizability, and ideally near-flat ground so the flat-plane decision holds.

Decision: St. Lawrence, clipped around St. James Park and adjacent blocks. One neighborhood, no switching in v1. Flatness and the meaning of the height field are confirmed in the data check before any data-layer code, not assumed.

Consequences: recognizable downtown site, real mid and high rise next to a real park, dramatic shadows. Likely flat, which supports ADR-002. The clip bounds are defined in `docs/data-acquisition.md`. If the data check shows the site is not flat enough, ADR-002 is revisited, not this one.

---

## ADR-002: Flat ground plane, disclosed in the do-NOT-measure list

Status: Accepted (contingent on the ADR-001 data check)
Date: 2026-06-02

Context: shadows need a receiver surface. Toronto is not perfectly flat. A full terrain mesh pulls in another dataset and more work. The honesty layer can absorb a simplification as long as it is named.

Decision: flat ground plane at Z=0 for v1. Buildings extrude from 0. "Terrain and ground slope" is listed in the do-NOT-measure list. If the height field turns out to be a roof elevation above a vertical datum rather than a height above grade, a single neighborhood ground datum is subtracted to recover height, and that datum is recorded in the provenance manifest.

Consequences: simplest receiver, correct enough on a flat downtown site, wrong on slopes. The disclosure is a feature. Per-building base elevation and a DEM are out of scope for v1.

---

## ADR-003: One solar engine, astronomy-engine, SPA as oracle only

Status: Accepted. Supersedes the initial intent to use SunCalc for the live path.
Date: 2026-06-02

Context: the load-bearing question for this product is how do you know your shadows are right. Running SunCalc for the live slider and a separate SPA implementation for validation means the shadows the judge watches are computed by a different, less accurate algorithm than the shadows that were validated. SunCalc also omits atmospheric refraction, which matters most at the low sun angles where shadows are longest and most contested.

Decision: astronomy-engine is the single runtime solar engine, with atmospheric refraction enabled, used for both the live slider and any measured shadow claim. NREL SPA is kept only as an external oracle inside the validation harness. There is no second runtime engine.

Consequences: the watched shadows are the validated shadows. Refraction is handled on the live path. One engine to reason about and tune. The validation harness checks astronomy-engine against SPA or NOAA tables across a year of dates and times. The low-sun-angle precision policy in `docs/architecture.md` section 5 still applies.

Alternatives rejected: keep SunCalc for the live path (live would not equal validated, no refraction). Use SPA at runtime (heavier, no benefit over astronomy-engine for an interactive slider).

---

## ADR-004: Placement is click for the where, natural language for the what

Status: Accepted
Date: 2026-06-02

Context: "add a 30-storey tower on this lot" has two parts, the where (this lot) and the what (30 storeys, tower, residential). Resolving the where from free text is a spatial-reasoning rabbit hole, and lots are a separate parcel dataset not present in the footprint data.

Decision: a user click sets the location. Natural language sets the parameters. The model never computes geometry; it emits an EditOp whose location comes from the click and whose numerics are bounded and validated. Free-text placement and any parcel-data dependency are post-hackathon.

Consequences: robust and demo-friendly, sidesteps both spatial reasoning and parcel data. The EditOp `at` field comes from the click. Selection and "this building" operate on the clicked massing polygon (see the multi-polygon note in `docs/architecture.md` and the data layer).

---

## ADR-005: Ship shadow-only first; FAR is the only candidate second consequence, deferred to kickoff

Status: Accepted. The FAR inclusion sub-decision is deferred to the June 8 kickoff.
Date: 2026-06-02

Context: scope discipline. Shadow is the hero and must be correct and validated before anything else. The consequence interface lets a second consequence be added without touching the data, coordinate, solar, or mutation layers. Shipping shadow-only is acceptable.

Decision: ship shadow-only until it is demo-solid and validated. If time remains, add FAR through the consequence interface: gross floor area over site area, site area from the clicked or drawn lot, a 3 metre per storey assumption disclosed and fed into the band as estimated. Final inclusion is decided at kickoff against the posed problem.

Consequences: protects the hero. FAR is additive and isolated, so the decision can wait. Sky view factor and walkability stay out of v1; their cost is recorded in `docs/architecture.md` section 8. If FAR ships, it needs a site area, which comes from the click or a drawn polygon, not a parcel dataset.

---

## ADR-006: Traffic is a wind tunnel, demand is set, flow is simulated, induced demand is never predicted

Status: Accepted
Date: 2026-06-19

Context: the traffic subsystem could easily slide into the exact thing this tool refuses, predicting the behavioral consequences of a development. The do-NOT-measure list already refuses "Traffic change" because trip generation and routing need behavioral models not grounded in geometry. A traffic feature that predicts the demand a tower creates would break the honesty brand outright. But there is an honest version: treat traffic like a wind tunnel, where you set the wind and watch the physics.

Decision: the honest boundary is absolute and has three categories. Demand (how many trips want to go from where to where) is never predicted by us, in particular never induced demand from a development; when demand exists in the product it is a user-set scenario badged as an assumption, like a user-added building is badged hypothetical. Flow (how a given demand distributes across the network, the per-edge volumes and speeds) is physics we simulate, with a confidence band. Counts (real measured Toronto open-data vehicle counts) are facts with a source and a date, used to validate the flow simulator and shown only as a factual readout. The product may say "under a demand scenario you set, here is how flow behaves, and here is how the simulator scores against measured counts." The product may never say "this development will cause this much traffic."

Consequences: traffic does not implement the geometry-derived `Consequence` interface, because flow depends on a user-set scenario, not on geometry alone; it lives in its own `src/traffic/` subsystem with its own honesty contract, which is the structural enforcement of this boundary. The existing do-NOT-measure "Traffic change" entry stays true and stays refused, and is refined to draw the demand-versus-flow distinction only when demand actually ships (the demand part), not before. Full rationale in `docs/traffic-architecture.md`.

---

## ADR-007: Road network from OpenStreetMap via Overpass, baked and ENU-aligned to the city model

Status: Accepted
Date: 2026-06-19

Context: the traffic subsystem needs a routable street network for the St. Lawrence / St. James Park catchment. It must share the city model's exact ENU frame, or roads and buildings drift apart on screen and every future travel time is wrong. The City 3D Massing data has no street network, so the network comes from a separate source. Two acquisition paths exist: osmnx in Python, purpose-built for a correct drivable graph, or an Overpass query processed in TypeScript.

Decision: source the drivable network from OpenStreetMap (Open Database License, attribution to OpenStreetMap contributors), fetched once via the Overpass API by `scripts/fetch-network.ts` into `data/network.json`, never fetched at app build or runtime. The snapshot stores raw lon/lat and normalized tags; at load, `parseRoadNetwork` reprojects every node through `src/coords/enu.ts` using the city model's own computed origin, so road and building share one frame by construction. Distances are never computed in EPSG:3857 metres. The drivable filter mirrors osmnx's `drive` type and excludes service roads and all non-drivable ways; the in and out lists are documented in `docs/traffic-architecture.md` section 4.4. Oneway tags become directed edges (two-way to two opposing edges, oneway to one, `oneway=-1` reversed; roundabouts and motorways default oneway when untagged). The acquisition uses Overpass plus TypeScript rather than osmnx, to keep one toolchain (`tsx` is already a devDependency) and exact control over the shared-origin reprojection; the verification gate guarantees correctness independent of the acquisition tool.

Consequences: the catchment bounding box (south 43.6400, north 43.6540, west -79.3850, east -79.3650) is larger than the building clip so traffic can enter and leave through the cordon arterials, the cordon reused in Part 3. The network is gated by `scripts/verify-network.ts` (connectivity, geometry, oneway, known routes, alignment) against the real snapshot, mirroring the height-verification gate. `data/known-routes.json` is the routing ground truth, the analogue of `data/known-heights.json`.

---

## ADR-008: Demand is user-set OD between cordon gateways, explicit and never predicted

Status: Accepted
Date: 2026-06-19

Context: the traffic wind tunnel (ADR-006) requires demand as an input the user sets, never a model output. The risk is that a demand feature quietly slides into predicting the trips a development generates, which is the exact behavioral consequence the tool refuses. Part 2 must let the user express demand in a way that is honest, bounded, demo-legible, and ready for the Part 3 flow assignment, without inventing demand.

Decision: demand for v1 is origin-destination through-traffic between cordon gateways only. Gateways are the major arterial crossings of the catchment boundary, curated in `data/cordon.json` (the hand-authored pattern of `data/known-routes.json`) and resolved at load by `src/traffic/cordon.ts` to the nearest strongly connected network node, so every gateway is routable. The user sets trips per hour between gateways as explicit numbers, not through the LLM, deliberately unlike the massing layer, because demand is precisely what we refuse to let a model produce. Demand is visualized as desire lines (straight origin-to-destination arcs), explicitly not street flow, so it is never confused with the simulated flow that arrives in Part 3. Every demand value is badged a user-scenario assumption with `DemandProvenance`, and `src/traffic/` has no dependency on the massing or edit layers, so there is no code path from buildings to demand.

Consequences: internal trip generators (trips to or from a clicked interior point) are deferred to a later part, to avoid a generator at a new tower reading as "the building creates demand." A structural gate, `scripts/verify-demand.ts`, asserts gateways resolve to strongly-connected nodes, the through directions are present, and the example scenario is valid and conserved; demand has no falsification oracle because it is an assumption, so the gate proves well-formedness and routability, not correctness. The do-NOT-measure list and export footer are refined so "induced travel demand" stays refused while user-set demand is named as a scenario. Part 3 consumes the OD flows (gateway connector nodes plus trips per hour) directly.

---

## ADR-009: Flow by incremental BPR assignment with a capacity-uncertainty band

Status: Accepted
Date: 2026-06-20

Context: Part 3 must turn the user's demand scenario into per-edge traffic flow honestly. The non-negotiables are that flow is physics simulated on a fixed network given user-set demand (never a demand prediction), that it comes with a real confidence band rather than a single number, and that the band's scope is declared. The method must show congestion feedback (so adding demand visibly slows and reroutes traffic) without overbuilding, and must stay out of the geometry `Consequence` interface because flow depends on demand, not geometry.

Decision: assign demand by incremental static assignment with a BPR volume-delay function. Demand is loaded in K increments, each routed on current shortest-time paths and then used to update edge times via `t = t0 * (1 + alpha*(v/c)^beta)` (alpha 0.15, beta 4); this is a disclosed approximation of user equilibrium, chosen over full Frank-Wolfe for simplicity. Free-flow time and capacity come from the Part 1 edge data (`lengthMetres`, `speedLimitKph`, `lanes`, `roadClass`), with per-direction lanes assumed to be `lanes` for oneway and `round(lanes/2)` for two-way. The confidence band is a Monte Carlo over capacity uncertainty: a nominal run (the mid) plus seeded-perturbed runs with per-edge capacity noise that is wider where Part 1 defaulted the `lanes` tag (the `defaulted` flag); the per-edge band is the volume range across the ensemble. Band scope is declared and narrow: capacity and congestion-response uncertainty only; route choice is assumed shortest-time and excluded from the band; demand is exact because the user set it; flow is not validated against real counts until Part 4. Flow is computed client-side for interactivity (the graph is small) and gated server-side by `scripts/verify-flow.ts`.

Consequences: the rendering colors streets by mid v/c and fades links where the band is wide, so uncertainty is visible rather than hidden, and the fade is tied to the Part 1 data-quality flag. The gate asserts trip conservation, node flow conservation, demand satisfaction, band ordering, free-flow sanity, and determinism on the real network and example demand. Equilibrium-grade accuracy, turn delays, signals, time-of-day dynamics, and the moving-vehicle animation are out of scope here; the animation and the count validation that turns "simulated" into "validated" are Part 4. Flow does not implement the geometry `Consequence` interface.

---

## ADR-010: Validation against real counts is a reported fit, not a validated-correct claim

Status: Accepted
Date: 2026-06-20

Context: Part 4 must score the simulated flow against reality to give the wind tunnel credibility, the analogue of the height-verification gate. But flag A in `docs/architecture.md` warns that matching a model to published traffic data cleanly is a research project, not a checkbox, and the cordon-only demand (ADR-008) omits local trips while the incremental assignment (ADR-009) is approximate, so any fit will be honest-but-imperfect. The risk is overclaiming a "validated" model. Counts are real measured data and must never be fabricated.

Decision: bake real City of Toronto midblock counts (the "Traffic Volumes - Midblock Vehicle Speed, Volume and Classification Counts" open dataset, 155 stations in the catchment) via `scripts/fetch-counts.ts` into `data/traffic-counts.json`, provenance-stamped including each station's own count date (vintages span years, disclosed). Match each station to the nearest network segment and score the simulated cross-section volume against the measured volume with the GEH statistic. Counts are a factual readout; the fit is reported honestly and is scenario-conditional, including where the model disagrees. The gate `scripts/verify-counts.ts` proves the harness is correct (counts well-formed and in the catchment, GEH exact on a synthetic identity case, the matcher resolves a healthy fraction of stations) and reports the real-count fit under the example demand without asserting a fit threshold; it passes on harness correctness, not on the model being right. The live flow animation is illustrative: particle density and speed reflect simulated volume and congested speed, not real vehicles or real positions.

Consequences: the count overlay colors each station by GEH agreement when flow is on, so the screen shows agreement and disagreement honestly, and the validation readout carries the median GEH, the percent within GEH 5 and 10, a simulated-versus-measured scatter, and the disclosure. OD calibration or demand estimation from counts is out of scope because that would be predicting demand, the exact thing the wind tunnel refuses. The traffic subsystem arc (Parts 1 to 4) is complete: a gated network, user-set demand, simulated flow with a band, and an honest comparison to measured reality.
