# Architecture Decision Log

Each record is a decision that is settled. Reopen one only with a new ADR that supersedes it.
Design rationale lives in `docs/architecture.md`; this file is the decisions, dated and terse.

The rebuild ADRs (R-series) define the new cinematic real-time simulator. The original ADRs
(001 to 010) are retained below with their disposition under the rebuild: carried, amended, or
superseded. None are silently dropped.

No em dashes anywhere by convention.

---

# Rebuild decisions (R-series)

## ADR-R01: WebGPU and TSL now; the real risk is the post stack, and the fallback is visibly lesser

Status: Accepted
Date: 2026-06-21

Context: the rebuild targets a cinematic look that makes an engineer doubt it is a browser.
The choice is WebGPU plus TSL now versus a mature WebGL2 high-end pipeline. WebGPU gives
compute shaders (the simulation thesis: the same layer renders and simulates), a node-based
post pipeline, and a single TSL source compiled to both WGSL and GLSL. Three r184 is installed
and ships the WebGPU and TSL builds (`three.webgpu.js`, `examples/jsm/tsl`); R3F 9.6 and drei
10.7 support the WebGPU entry.

The headline risk is not WebGPU the API. Browser support is broad in 2026 (Chrome and Edge
stable, Safari 18+, Firefox shipping). The thin ice is the post stack. The turnkey,
battle-tested post effects (pmndrs `postprocessing` and `@react-three/postprocessing`: GTAO,
bloom, DOF, SSR) target the classic WebGL `EffectComposer` on the standard `WebGLRenderer`.
The WebGPU look is built on the newer node-based post pipeline (`PostProcessing` from
`three/webgpu` with TSL passes), which has fewer built-in effects, rougher edges, and far less
R3F integration than the pmndrs stack engineers reach for by reflex. GTAO, SSR, and TAA as TSL
nodes are the least-proven part of the whole plan.

A precise correction to a tempting mental model: the WebGL2 fallback is not a separate pmndrs
`EffectComposer` pipeline unless we choose to make it one. `WebGPURenderer` has a WebGL2
backend, and the same node post pipeline (TSL authored once) compiles to GLSL and runs on that
backend, so in principle one post pipeline serves both paths. The catch is per pass: passes
that lean on compute or storage textures (some GTAO and SSR implementations, certain TAA
history strategies) have no WebGL2 path and silently drop or must be simplified there. So the
fallback is not a free degrade of one uniform pipeline. It is the same node pipeline minus its
compute-dependent passes, which is a materially lesser look.

Decision: build on `WebGPURenderer` with TSL for all materials, post, and compute, authored
once and compiled to WGSL on the WebGPU backend and GLSL on the WebGL2 backend. Use the
node-based post pipeline on both backends; do not add a second pmndrs `EffectComposer` pipeline
for the fallback. The fallback is accepted as visibly lesser: it runs the passes that have a
WebGL2 path (tone mapping, a cheap bloom, basic fog and grade) and drops the compute-dependent
ones (GTAO, SSR, advanced TAA), with every stage already a toggle so the WebGL2 subset is a
known-good configuration. The reason for not building a second post path: maintaining two
look-dev surfaces, the node pipeline and a pmndrs `EffectComposer` pipeline, doubles the most
fiddly and look-defining part of the engine for a shrinking fallback audience, and the
cinematic target is the WebGPU demo machine. Engineering concentrates where the spectacle lives.

Consequences: one shader stack and one post pipeline across both backends; GPU compute for
agents and flow on WebGPU; the node post on WebGPU is the art-directed look; the WebGL2
fallback runs but looks plainer, by decision, not by accident. The post-maturity risk is the
headline risk in `docs/architecture.md` section 10, and Unit 1 exists specifically to prove the
GTAO-plus-bloom post path before anything is built on it. Bounded by the per-stage toggle
architecture and by the performance gate (ADR-R08).

Alternatives rejected: a WebGL2-only high-end pipeline with the mature pmndrs stack (no
compute, so the render-and-simulate thesis dies and agent scale is capped; mature post but a
lower ceiling and no path to the simulation spectacle). A dual pipeline, node post on WebGPU
plus a full pmndrs `EffectComposer` on WebGL2 (best fallback look, but doubles the look-dev
surface for the least-important audience; rejected on cost). Hand-written WGSL (loses the
single-source TSL compile to both backends).

## ADR-R02: Stay on Next.js App Router, for continuity, not fit

Status: Accepted
Date: 2026-06-21

Context: the choice is keeping Next.js versus moving to a leaner setup (Vite plus a thin server)
better tuned to a real-time 3D editor. Be honest about the tradeoff. A 3D editor is
overwhelmingly a client app: the entire canvas and editor tree is client-only, loaded with
`ssr: false` throughout, so Next's server rendering, RSC, and streaming earn almost nothing for
the app itself. The real day-to-day cost of the framework choice is shader-iteration speed.
Tight TSL and material work lives and dies on hot-reload latency, and Vite's HMR is the gold
standard there; Turbopack is good but not better. What Next still genuinely earns is narrow:
the LLM edit route handler (a real server endpoint), the build-time data pre-resolution (a
server component runs `loadCityModel` with Node `fs` and hands the client a slim payload,
though a Vite build script could do the same), the Vercel deploy path, and the fact that the
toolchain is already wired.

Decision: stay on Next.js 15 App Router, primarily to avoid changing the build system at the
same time as rebuilding the entire rendering, simulation, and interaction stack. Do not change
two hard things at once. The WebGPU root and the whole canvas tree are a client island
(`dynamic(..., { ssr: false })`); Turbopack is the dev bundler; the LLM route and the
build-time data baking stay as they are. This is a continuity decision, not a claim that Next
is the best tool for a real-time editor.

Consequences: no migration tax, the kept data and LLM layers keep working, and the rebuild's
risk budget goes to the WebGPU pipeline (the actual bottleneck), which is framework-agnostic.
We accept slower shader HMR than a Vite setup would give, and the ergonomic friction of running
a heavy client island inside an SSR framework (`'use client'` and `ssr: false` everywhere).

Revisit trigger, recorded explicitly: if we find ourselves fighting SSR across the app,
dynamic-import and hydration friction recurring, or Turbopack fighting the WebGPU/TSL build, or
if shader-iteration latency becomes a measured drag on look development, reconsider and move the
client app to Vite with a thin server (or a Vite build plus the existing route extracted to a
small handler). The kept layers are framework-agnostic, so that migration stays cheap; this ADR
is the marker for when to pay it.

Alternatives rejected: Vite plus a thin server now (the better dev loop and shader HMR, but
re-solving data baking, the API route, and deploy at the same moment as the engine rebuild;
deferred to the revisit trigger rather than rejected outright). Pure static SPA (loses the
build-time server data resolution that keeps the client payload slim).

## ADR-R03: Greenfield rebuild in place, porting the kept assets

Status: Accepted
Date: 2026-06-21

Context: the choice is transforming the current repo in place versus a separate greenfield
project that ports the kept assets. The kept assets are small and clean (coords, solar, the
model loader, the network parser, the BPR math) and the baked `data/` is large and the whole
point. A separate repo would duplicate the data and the git history for little benefit; an
unconstrained in-place transform risks the old honesty-tool architecture leaking into the new
one through half-migrated modules.

Decision: rebuild in place in this repo, but treat it as greenfield above the kept layer.
Demolish `src/honesty/`, `src/scene/`, `src/ui/`, and the old `app` wiring outright (Unit 0,
one demolition commit), keep and port `src/coords/`, `src/solar/`, `src/model/`,
`src/network/`, `src/mutation/`, `src/traffic/assignment.ts`, and all of `data/`, then build the
new rendering, simulation, and interaction layers fresh. The kept modules are ported by
slimming (strip provenance/honesty types), not by accretion.

Consequences: the data and the clean math survive with their history; the dead presentation and
honesty layers are removed in one clean commit so they cannot leak. The new `src/` tree
(rendering, simulation, interaction) is greenfield. CLAUDE.md and the README are rewritten to
the new identity as part of the sequence.

Alternatives rejected: pure in-place evolution (the old architecture and its honesty framing
leak into the new one). Separate greenfield repo (duplicates 1.7 MB of baked data and loses
history for no architectural gain).

## ADR-R04: AgX tone mapping

Status: Accepted
Date: 2026-06-21

Context: tone mapping is the single most look-defining post choice. ACES is the familiar
filmic default; AgX (now in Three.js core) gives cleaner highlight desaturation and a less
orange, more neutral filmic shoulder.

Decision: AgX is the tone-mapping operator, applied in the node post pipeline before LUT
grading. Per-mood LUTs do the warm/cool art direction on top of AgX's neutral base. The
operator is a single switch so ACES can be A/B compared during look development, but AgX is the
shipped default.

Consequences: skylines at golden and blue hour hold highlight color instead of clipping to
orange; the grade has a clean filmic base to push. The mood comes from the LUT and the lighting,
not from a baked-in tone curve.

Alternatives rejected: ACES (heavier, warmer shoulder, more aggressive highlight desaturation
shift). Linear/Reinhard (not cinematic).

## ADR-R05: Fixed-timestep simulation at 60 Hz, decoupled from render, interpolated

Status: Accepted
Date: 2026-06-21

Context: the simulation must be stable and behave the same independent of frame rate, while the
render stays smooth at any display refresh. Coupling simulation to the render loop makes
behavior frame-rate dependent and breaks on stalls.

Decision: the simulation advances on a fixed timestep of 1/60 s, driven by an accumulator that
drains real elapsed time into whole fixed steps, clamped against the spiral of death. The render
loop interpolates between the last two simulation states by the leftover alpha. Systems are pure
steps over their buffers, so they are deterministic on CPU (GPU compute is stable but not
bit-identical across hardware, accepted in `docs/architecture.md` section 10).

Consequences: smooth motion at 30, 60, 120, or 144 Hz; stable agent and flow behavior; a clean
seam for hot-reloading individual systems. The render never reads a half-stepped state.

## ADR-R06: Structure-of-arrays data layout with GPU-resident buffers

Status: Accepted
Date: 2026-06-21

Context: tens of thousands of agents and a network flow field need a layout that is cache-
friendly on the CPU and maps directly onto GPU storage buffers, so a system can move between CPU
and compute without reshaping its data.

Decision: large simulated populations are stored structure-of-arrays (one typed array per
attribute), not arrays of objects. SoA attributes back GPU storage buffers one-to-one. A light
ECS-style registry records which systems own which buffers and the order they run, and whether
each system steps on CPU or GPU. The CPU/GPU split is per system: GPU compute for agent advection,
particles, and the flow field at scale; CPU (or Rust-to-WASM for a profiled hotspot) for graph
routing, BPR increments, growth rules, and edit application.

Consequences: the render reads simulation buffers directly with no per-agent object churn; the
CPU-to-GPU handoff (CPU writes demand, GPU advects agents) is explicit and testable; WASM is held
in reserve, adopted only against a measured hotspot, not up front.

## ADR-R07: Honesty apparatus removed; the one line is held by register, not badges

Status: Accepted. Supersedes the honesty-as-product-surface stance of the original build.
Date: 2026-06-21

Context: the original product's differentiator was an honesty apparatus: per-building confidence
badges, a do-not-measure list treated as a feature, confidence bands on every number, and a
provenance-baked export footer treated as a contract. The rebuilt product identity is a
cinematic creative simulator where spectacle and feel are primary and validated accuracy is
explicitly secondary. The honesty apparatus is the costume of authority the new identity must
shed, while the underlying integrity principle must survive.

Decision: remove the honesty apparatus entirely: `src/honesty/`, the confidence-band machinery,
the do-not-measure panel, the confidence badges, and the provenance-baked export footer. Carry
forward exactly one principle: simulated values are never disguised as measured truth. In the new
product that principle is enforced by visual and linguistic register, not by a subsystem.
Grounded values (the real Toronto building heights the geometry is extruded from, the real road
network) read as real; simulated values (flow, growth, weather, agents) look and read as part of
the simulated world. A single dataset attribution credit line replaces the provenance footer. No
fake-precise number is ever presented as measured truth, and no badge implies a validation that
does not exist, which now means simply that we do not build such badges.

Consequences: the entire `src/honesty/` tree and the band code are demolished (ADR-R03 Unit 0).
The do-not-measure framing, the GEH count-validation product surface, and the gate-as-product
surface go with it. The verification scripts remain only as developer data sanity checks. This
supersedes original ADR-005's honesty hooks, the wind-tunnel honesty contract in ADR-006, and the
validation-as-reported-fit posture in ADR-010 insofar as they were product surfaces; the traffic
math survives as spectacle (see disposition of ADR-006, 009, 010 below).

## ADR-R08: Performance budget is a first-class gate; a milestone is not done until it holds on both paths

Status: Accepted
Date: 2026-06-21

Context: the old build's discipline was a set of correctness gates (height verification, GEH
validation). Those are gone with the honesty apparatus (ADR-R07). But a real-time cinematic
simulator has its own load-bearing falsifiable claim, the only one that matters here: does it
actually run, smoothly, on real hardware. Spectacle that stutters fails the core mandate. So
the gate discipline is carried into the new product as a performance budget, not a correctness
one.

Decision: define an explicit frame-time budget, two reference devices, and a measurement
method, and make holding the budget a release condition for every milestone.

- Budget. WebGPU path: 60 fps sustained, a 16.6 ms frame, during the demonstrable interactions
  of the milestone (orbit, sun scrub, edit drag, flow running). WebGL2 fallback path: a hard
  floor of 30 fps, a 33 ms frame, with the reduced post subset (ADR-R01). Sustained, not peak:
  the budget is the worst frame during interaction, not the average.
- Reference device (the WebGPU target, the demo machine): an Apple M-series MacBook Pro, M2 or
  better, in a current Chrome, Edge, or Safari with WebGPU. This is what the demo runs on and
  what 60 fps is measured against.
- Floor device (the fallback target): a mid-range integrated-GPU laptop, Intel Iris Xe class, on
  the WebGL2 backend. The app must hold 30 fps here with the reduced post. If it cannot, the
  fallback look is cut further until it does.
- Supporting ceilings: the static city renders in low hundreds of draw calls, target at or under
  roughly 150 for buildings, roads, and ground combined, via BatchedMesh (ADR-R09); the agent
  system targets 10,000 vehicle agents at 60 fps on the reference device via GPU advection,
  degrading the agent count on the floor device rather than dropping the frame.
- Measurement. stats-gl for frame time and GPU time (it uses GPU timer queries, so it measures
  the GPU, not just rAF spacing), plus `renderer.info` for draw calls, triangles, and program
  and texture counts. Each milestone is profiled on both a WebGPU device and a WebGL2 device
  before it is called done; the numbers go into the perf notes.
- The rule: a milestone is not done until it holds its budget on both paths. This bites hardest
  twice: at Unit 1, the rendering pipeline (the post stack is the most expensive and least
  proven part), and at the agent-simulation milestone (Unit 5 after the sequence renumber),
  where agent count meets frame time.

Consequences: performance is a gate, not an afterthought; the post stack and the agent count are
sized to the budget from the start, not optimized at the end. The budget makes the ADR-R01
fallback decision concrete: the WebGL2 post subset is whatever holds 30 fps on the floor device.
Profiling before optimizing (architecture section 3.5) is the standing method; this ADR sets the
pass/fail line it measures against.

## ADR-R09: The static city is one BatchedMesh, not InstancedMesh

Status: Accepted
Date: 2026-06-21

Context: the city is 1315 building polygons, each a unique footprint and height, plus unique
road geometry. The draw-call budget (ADR-R08) demands they render in a handful of draws, but
they must also stay individually selectable and individually mutable (height edits, hypothetical
additions) for the editor. The terminology has to be exact, because the three tools that look
similar are not interchangeable. InstancedMesh draws one geometry many times with per-instance
transforms; it is for identical copies (a thousand of the same tree) and is wrong for a thousand
distinct buildings. Merged geometry (one big buffer via `mergeGeometries`) draws everything in
one call but dissolves per-object identity: selection means raycasting and mapping a face back
to a building through tracked vertex ranges, and editing one building means rebuilding the merged
buffer or surgically rewriting a range, with no per-object frustum culling.

Decision: the static city is a `BatchedMesh`: many unique geometries in a single draw call, with
per-object transforms, per-object visibility, and per-object frustum culling built in. Each
building cluster (and each road segment group) is one geometry id within the batch, which gives
selection identity for free (the draw reports its geometry id), lets a height edit update or swap
one geometry without touching the rest, and lets a hypothetical building be added or hidden per
object. Buildings and roads are separate BatchedMeshes by material. The old `src/scene/buildings.ts`
merge helpers are a reference for shape construction only, not the approach.

Consequences: one draw call for the building city and one for roads, satisfying ADR-R08, while
the editor keeps per-building selection and mutation without raycast-to-range bookkeeping. One
integration check is owed in Unit 1: BatchedMesh under TSL node materials on the WebGPU backend
and its WebGL2 fallback. This is part of Unit 1's scope, though the headline Unit 1 risk remains
the post path, not the geometry.

Alternatives rejected: InstancedMesh (semantically wrong: the geometries are unique, not
instances). Merged geometry (one draw call but loses per-object identity, culling, and cheap
mutation, which the editor needs). One mesh per building (1315 draw calls, blows the budget).

---

# Original decisions (001 to 010) and their disposition under the rebuild

## ADR-001: One neighborhood, St. Lawrence / St. James Park

Status: Carried.
Date: 2026-06-02. Disposition: 2026-06-21.

Original: v1 demos on one recognizable Toronto neighborhood, St. Lawrence clipped around St.
James Park, no switching.

Disposition: carried. The baked `data/stlawrence.geojson` (1315 building polygons) and the
matching road, cordon, and count snapshots remain the canvas for the rebuild. Single
neighborhood for now; additional neighborhoods are a later unit in the rebuild sequence, not a
v1 commitment. The rationale shifts from "recognizable to judges" to "a dense, dramatic,
real slice of Toronto to make cinematic," but the site and the data are unchanged.

## ADR-002: Flat ground plane

Status: Carried, reframed.
Date: 2026-06-02. Disposition: 2026-06-21.

Original: flat ground plane at Z=0, buildings extruded from 0, terrain disclosed in the
do-not-measure list.

Disposition: carried as a rendering and simulation simplification; the flat ENU plane stays the
ground and the agent substrate. The do-not-measure disclosure is dropped with the honesty
apparatus (ADR-R07). The flat plane is now an art-directed surface (PBR ground material, wet-road
SSR) rather than a disclosed limitation. A terrain mesh remains out of scope and is now a
look/scope choice, not an honesty one.

## ADR-003: One solar engine, astronomy-engine, refraction on

Status: Carried.
Date: 2026-06-02. Disposition: 2026-06-21.

Original: astronomy-engine is the single runtime solar engine with refraction, SPA as an oracle
only in the validation harness.

Disposition: carried fully. `src/solar/sun.ts` and `src/solar/time.ts` are kept verbatim and are
the source of the sun vector for the time-of-day system and cascaded shadows. The astronomy is
correct and isolated; the rebuild layers an art-directed sky, fog, and light-color model on top
of the same vector. SPA stays as a developer check only. The MIN_SUN_ALTITUDE precision policy is
no longer a false-precision guard (no numbers are printed); it survives only as a practical
shadow-stability threshold for the cascade setup.

## ADR-004: Placement is click for the where, natural language for the what

Status: Amended.
Date: 2026-06-02. Disposition: 2026-06-21.

Original: a click sets location, natural language sets parameters; the model never computes
geometry.

Disposition: amended. Direct manipulation (selection plus transform gizmos) becomes the primary
edit path in the new editor. Natural language is retained as a secondary fast path resolving to
the same EditOp set, and the principle that the model never computes geometry holds. "Click for
where, language for what" is generalized to "manipulate directly, or describe; both produce the
same bounded EditOps." The reused `src/mutation/` spine is reworked accordingly.

## ADR-005: Ship shadow-only first; FAR deferred

Status: Superseded by ADR-R07 and the rebuild sequence.
Date: 2026-06-02. Disposition: 2026-06-21.

Original: ship shadow-only with confidence bands; FAR as the only candidate second consequence;
the geometry-derived `Consequence` interface returns a band.

Disposition: superseded. The product is no longer a consequence-band tool. The `Consequence`
interface and FAR are dropped. "Shadow first" survives only in spirit: the first rebuild
milestone is the lit city with sun shadows (Unit 1), but as spectacle, not as a measured
consequence with a band. Consequences in the new product are the living, legible reactions of the
simulation (flow reroutes, growth, light), not band-returning plugins.

## ADR-006: Traffic is a wind tunnel; demand set, flow simulated, induced demand never predicted

Status: Superseded by ADR-R07 (as a product/honesty contract); the math is carried.
Date: 2026-06-19. Disposition: 2026-06-21.

Original: a strict honesty contract separating user-set demand, simulated flow, and measured
counts, with traffic deliberately outside the geometry `Consequence` interface.

Disposition: the honesty contract is superseded; the engineering is carried. The rebuilt product
is a creative simulator, so the careful "we never predict demand" framing is no longer the point.
The BPR flow engine and the network become a spectacle-first living flow field that visibly
reacts when the user reshapes the city. Demand can be derived plausibly from density and zoning
as part of the simulated world (clearly simulated, never dressed as measured), which the original
contract forbade and ADR-R07 now permits within the one held line. The flow stays its own system,
not a geometry consequence, for the architectural reason (it depends on more than geometry), not
the honesty reason.

## ADR-007: Road network from OpenStreetMap via Overpass, baked and ENU-aligned

Status: Carried.
Date: 2026-06-19. Disposition: 2026-06-21.

Original: the drivable network is baked from OSM via Overpass into `data/network.json`,
reprojected at load through the shared city origin so road and building co-register, oneway and
topology handled, gated by `verify-network`.

Disposition: carried. `data/network.json` and the `src/network/` parser are the substrate for the
vehicle-flow system. The shared-origin ENU reprojection is exactly right and unchanged. The
attribution to OpenStreetMap contributors (ODbL) is retained in the credit line. The
`verify-network` gate remains a developer sanity check, no longer a build gate.

## ADR-008: Demand is user-set OD between cordon gateways, never predicted

Status: Superseded by ADR-R07.
Date: 2026-06-19. Disposition: 2026-06-21.

Original: demand is user-set origin-destination through-traffic between cordon gateways, set
explicitly (never via the LLM), drawn as desire lines, badged as an assumption, with no code path
from buildings to demand.

Disposition: superseded. The structural prohibition on deriving demand from the city is lifted
(ADR-R07): in a creative simulator, demand plausibly generated from density, zoning, and time of
day is legitimate simulated content as long as it reads as simulated. The cordon and
`data/cordon.json` are retained as a useful way to inject through-traffic at the boundary, but
demand is no longer constrained to user-set OD, and the desire-line-versus-flow honesty
distinction is dropped.

## ADR-009: Flow by incremental BPR assignment with a capacity-uncertainty band

Status: Carried (engine), amended (band).
Date: 2026-06-20. Disposition: 2026-06-21.

Original: incremental static assignment with a BPR volume-delay function, plus a Monte Carlo
capacity-uncertainty band, gated by `verify-flow`.

Disposition: the BPR assignment engine (`src/traffic/assignment.ts`) is carried as the flow-field
solver that drives agent density and speed. The capacity-uncertainty band is amended out as a
product output (no bands in the new product, ADR-R07); the ensemble may survive internally only
if it cheaply improves the look, otherwise the nominal run suffices. The engine feeds GPU agent
advection (ADR-R06), turning a static colored-streets result into a living animated flow.

## ADR-010: Validation against real counts is a reported fit, not a validated-correct claim

Status: Superseded by ADR-R07.
Date: 2026-06-20. Disposition: 2026-06-21.

Original: score simulated flow against real Toronto midblock counts via GEH, report the fit
honestly as scenario-conditional, never claim validated-correct.

Disposition: superseded as a product surface. The GEH count-validation overlay and the validation
readout are removed with the honesty apparatus. `data/traffic-counts.json` and
`src/traffic/validation.ts` remain only as an optional developer plausibility check on the flow
engine. The product makes no validation claim and shows no fit, consistent with "accuracy is
explicitly secondary" and the one held line that nothing simulated is dressed as measured truth.
