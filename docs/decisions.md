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
