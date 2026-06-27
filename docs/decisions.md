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

## ADR-R10: Selection picks by CPU raycast against the BatchedMesh, not a GPU id-pass

Status: Accepted
Date: 2026-06-23

Context: selection must resolve a pointer to a specific building cluster, through the single
BatchedMesh (ADR-R09) and without being defeated by the node post pipeline (ADR-R01). Two families
exist. A GPU id-buffer pick renders object ids to an offscreen target and reads back the pixel
under the cursor: that is an extra render pass wired into the same node graph that is the project's
headline risk, a frame-stalling readback, and an ongoing burden to keep in sync with the post
pipeline's targets. A CPU raycast tests the ray against the batched geometry on the main thread.
Footprint fragmentation (the data spine) means a building is several polygons, so a pick must
resolve to the whole cluster, never a single polygon.

Decision: pick by CPU raycast against the BatchedMesh. three's `BatchedMesh.raycast` reports the
hit instance as `intersection.batchId`; that instanceId maps to a clusterId through a table built
once in the same order the instances were added (`cityIndex.buildInstanceClusterIds`, fed by
`cityGeometry`'s own emitted ids so it cannot drift), and parked on the mesh `userData`. A click
that misses the city clears the selection. Selection state lives in a dependency-free
`useSyncExternalStore` store (`selectionStore`), the same pattern as the day clock.

Consequences: picking is backend-agnostic, identical on the WebGPU and WebGL2 paths, and never
touches the post stack, so it carries none of the ADR-R01 risk. The cost is one CPU raycast per
click against roughly 1300 instances, negligible at click frequency. If hover-picking every frame
or a far larger city ever makes per-click raycast a bottleneck, a GPU id-pass can be revisited; it
is not needed now.

Alternatives rejected: GPU id-buffer pick (an extra pass in the at-risk node graph, a
frame-stalling readback, and target-sync burden, for no benefit at this scale). Raycasting merged
geometry and mapping face ranges back to buildings (exactly the bookkeeping ADR-R09 exists to
avoid).

---

## ADR-R11: Height edits re-batch via a per-instance Y-scale matrix; grounded geometry is never rebuilt

Status: Accepted
Date: 2026-06-23

Context: a height edit must change a building's height live under a gizmo and on commit, while the
grounded measured heights stay sacred (heights are never invented or mutated) and identity,
per-object culling, and shadows survive (ADR-R09). Each building's extruded geometry is world-placed
with its base at y=0. A height change can be applied two ways: rebuild the affected geometry at the
new height and re-add it to the batch, or scale the existing instance with a per-instance matrix.

Decision: a height edit is a per-instance Y-scale matrix on the BatchedMesh, `scale(1,
newRep/oldRep, 1)`, applied to every instance of the cluster. Because each base sits at y=0, a
Y-scale about the world origin scales height and keeps the base grounded for any footprint position.
The grounded geometry is never rebuilt and the original heights are never mutated; the edit lives in
the existing edit overlay (`modifiedClusterHeights`, an undoable log) and is mirrored into a
per-frame ratio store (`editRatios`) the renderer reads in `useFrame`. The gizmo drives a transient
live-drag ratio; release snaps to whole storeys and commits a `ModifyBuilding` op, the same bounded
op the natural-language path resolves to (ADR-004 amended). The selection glow and the gizmo proxy
read the same ratio so they track the building.

Consequences: no geometry reallocation on edit, so no rebuild stutter and the draw stays one call
(ADR-R08, ADR-R09); per-instance culling and CSM shadows follow the scaled matrix for free. The
overlay stays the logical source of truth for undo, persistence, and the simulation and language
paths, decoupled from the visual fast path. The matrix path is height-only by construction;
translate or footprint edits (a later unit) need a new op and may exercise the geometry-swap path.
One known limit: the BatchedMesh's overall bounding volume is not recomputed on edit, so a building
scaled to an extreme height relies on per-object frustum culling (on by default) rather than the
whole-mesh bound; acceptable while the city stays in frame.

Alternatives rejected: rebuilding the cluster geometry at the new height on every commit (correct
but reallocates and stutters, and tempts mutating the grounded geometry). Writing edited heights
back into the original building list (violates the grounded-heights-are-sacred spine and loses
cheap undo).

---

## ADR-R12: Agents are GPU-resident SoA on a CSR graph, advected by a TSL compute kernel

Status: Accepted
Date: 2026-06-24

Context: the living traffic must scale to thousands of agents at 60 fps without choking the main
thread (ADR-R05, ADR-R06, ADR-R08). Agents are copies of one mesh, so InstancedMesh is correct (the
opposite of the city's BatchedMesh, ADR-R09). The question was where the per-agent state lives and
who advances it: CPU stepping with per-frame matrix writes, or GPU compute over storage buffers.

Decision: agent state is structure-of-arrays in GPU storage buffers (packed (edgeIndex, distance)
plus a PRNG seed), advanced by one TSL compute kernel per frame and drawn as one InstancedMesh whose
vertex stage derives world position and heading from the buffers; the fragment stage derives the
head/tail colour. The road graph is flattened to CSR adjacency (edge endpoints, length, speed, free
speed, to-node packed to vec4s; offsets and edge lists as uint buffers) so the kernel does bounded
intersection hand-offs by PRNG without walking polylines. A CPU reference path (stepAgents on the
same graph) is kept as both the WebGL2 fallback and the correctness oracle, visibly lesser by count,
not by look (the car geometry and colour are shared in carLook). The kernel is wrapped so any build
failure returns null and the caller falls back to the CPU path (ADR-R01).

WebGPU caps storage buffers at 8 per shader stage. The layout is packed to stay under: the compute
reads or writes only the agent state plus the graph it needs to advect (edgeData, CSR), and the
render derives position, heading, and colour from state plus geometry. Compute uses five buffers, the
vertex stage three, the fragment stage two. The original 14-buffer layout silently failed pipeline
creation (the kernel never ran, agents sat frozen at spawn), which is what forced the packing.

Consequences: 60 fps headroom with tens of thousands of agents, no per-frame CPU matrix churn, one
draw call. The count is tuned for the look, not the limit (restrained ambient life, see the spectacle
note), and the kernel scales far past it. The straight-edge GPU approximation loses polyline fidelity
that the CPU path keeps; acceptable at city scale. The per-stage buffer budget is now a hard design
constraint for any future per-agent data.

Alternatives rejected: CPU stepping at the target count (main-thread cost, matrix upload every
frame). One merged geometry (loses per-agent instancing). A texture-based GPGPU ping-pong (heavier
and less direct than TSL storage buffers on the WebGPU path).

---

## ADR-R13: Traffic reacts to edits via a cheap client re-solve; buildings generate demand

Status: Accepted
Date: 2026-06-24

Context: the product is a living, manipulable city. Editing a building should visibly move the
traffic, closing the loop from direct manipulation (ADR-R11) to simulation. But the kept flow stack
deliberately had no code path from buildings to demand: demand was cordon through-traffic only, set
as a scenario, never derived (ADR-006, ADR-008), a honesty-era invariant. ADR-R07 removed that
apparatus and put flow explicitly in the simulated world, to be invented freely. The flow was also
solved once at build time on the server, too static to react and too heavy (a nominal pass plus an
eight-sample uncertainty ensemble) to re-run live.

Decision: building height generates trips. A height edit injects origin-destination demand between
the building's nearest road node and the cordon gateways, proportional to the added storeys
(TRIPS_PER_STOREY); the flow re-solves with that folded into the cordon baseline; the roads re-tint
and the agents slow on the freshly-congested edges. The re-solve runs in the browser on edit commit
(mouseup, debounced through the edit overlay, not per drag frame) using a lightweight single-run
solve (solveFlowLite: one nominal assignment, no ensemble), so there is no network round-trip and
latency stays low (latency is the enemy). The inputs are precomputed server-side and shipped slim:
routable edges without geometry, the base OD, gateway nodes, and the street-to-edge and
cluster-to-node maps. Propagation reuses existing handles: the road congestion vertex attribute is
rewritten in place, and the agents' per-edge speed column (read-only in the kernel) is updated and
re-uploaded. This supersedes the no-buildings-to-demand stance of ADR-006 and ADR-008 for the
simulated layer; it does not dress the result as measured (the one line, ADR-R07), it is honestly
simulated flow.

Consequences: the edit loop is complete and local. Raising a building loads its access roads and the
corridors that reach the boundary; the effect strength is one dial (TRIPS_PER_STOREY). Lowering a
building below its real height does not relieve traffic below the cordon baseline, since the baseline
carries no per-building load (raising is the interaction that drives the loop); a symmetric model
would require baselining every building's trips, which is heavier and not needed yet. The live solve
is nominal-only, so the uncertainty band is not shown during reactivity; the band remains available
for a static read.

Alternatives rejected: a server API re-solve per edit (network latency on every interaction). A local
congestion bump on adjacent edges only (cheap but not a network equilibrium, no downstream or route
effects). Keeping demand fixed and decoupled (leaves building edits with no traffic consequence, so
no living loop).

---

## ADR-R14: Nightfall window lights are a procedural emissive node on the city material

Status: Accepted
Date: 2026-06-24

Context: the city needed to come alive at night. The most cinematic next step (Unit 6) was lighting
the massing itself, a scatter of warm windows that ramps on at dusk and reads as a real skyline. The
constraint was the spine: it had to stay one BatchedMesh (ADR-R09), hold the performance budget on
both paths (ADR-R08), survive a live height edit (ADR-R11), and never invent geometry it could not
justify. A naive approach, per-window emissive quads or point lights, would multiply draw calls and
light counts and defeat the one-BatchedMesh decision outright.

Decision: windows are a procedural emissive contribution authored in TSL and attached to the city
material's emissiveNode, evaluated entirely in the fragment stage. A floor/bay grid is laid from
positionWorld; walls are separated from roofs and caps by the surface normal; each cell is lit or
unlit by a stable per-cell hash so the scatter is mostly dark (litFraction 0.28) and de-correlates
building to building for free off world coordinates. Lit panes carry a warm amber-to-white spread
with a rare cool accent and a small per-window brightness jitter, sit above 1.0 in HDR so the
existing bloom catches them, and ramp on across dusk via the shared daylightLive factor
(windowNightGain). A small dynamicFraction slowly re-rolls on a low-rate staggered tick so the odd
window switches on or off over the night, never a flicker. There is no new geometry, no draw call,
and no compute: pure material math, identical on both backends, which is why the WebGL2 fallback
renders the lights the same as WebGPU rather than dropping them like a compute-dependent pass.

The edit-reactivity fell out of a BatchNode detail rather than a new seam. BatchNode folds the
per-instance batching matrix (which carries the ADR-R11 height-edit Y-scale) into positionLocal and
thus positionWorld, while positionGeometry stays raw. Keying the floor rows off positionWorld.y means
a raised building's world height grows and it gains more rows of windows as it rises, instead of
stretching the existing ones; at rest (ratio 1) it equals the raw geometry height so the look is
unchanged. This removed the per-instance editRatio attribute the planning pass had proposed as an
unproven seam: it was never needed. The node math is mirrored by THREE-free pure functions
(windowNightGain, windowSeed, isWindowLit, paneMask, wallMask, floorCoord) unit-tested in node.

Consequences and the measured gate (ADR-R08), at night with windows lit, on device: WebGPU 54 fps /
18.7 ms, WebGL2 fallback 32 fps / 31.4 ms. The fallback clears its 30 fps floor. WebGPU sits about
10 percent under the 60 fps reference target, and the windows are not the cause: they add zero draw
calls and only a handful of ALU ops on wall pixels, so the draw count is identical with or without
them. The cap is the scene-wide draw-call count, 1885 on the WebGPU post path versus 20 on the
post-less WebGL2 direct render. That gap points at the BatchedMesh not collapsing to a multi-draw on
the WebGPU backend, or per-pass draw counts accumulating across the node post graph. It is a
pre-existing concern that touches ADR-R09, not a window-lights regression, and is flagged for a
dedicated draw-call investigation as the next perf pass. The visual gate passed on both backends.

Alternatives rejected: a baked emissive lightmap or texture atlas (loses live edit-reactivity, costs
memory, and would not gain floors on a raise). Per-window instanced quads or extruded emissive
geometry (draw-call and geometry cost, defeats the one-BatchedMesh spine). A per-window or per-cell
point light (absurd light count, no chance at budget). A per-instance editRatio storage attribute to
drive floor count (the unproven seam, made unnecessary once positionWorld was found to already carry
the edit scale).

---

## ADR-R15: BatchedMesh draws per sub-instance on the WebGPU backend; copies use InstancedMesh

Status: Accepted
Date: 2026-06-25

Context: the performance gate (ADR-R08) measured the WebGPU reference at 54 fps at night against the
60 fps target, while the WebGL2 fallback held its floor. An on-screen draw-call readout showed 1885
draws on WebGPU versus 20 on WebGL2 for the same scene. Reading three r184's WebGPUBackend draw path
explained the gap: a BatchedMesh on the WebGPU backend is drawn with a CPU-side loop, one drawIndexed
per visible sub-geometry, each call bumping info.render.drawCalls (WebGPUBackend.js _draw, the
isBatchedMesh branch). The WebGL2 backend instead takes the WEBGL_multi_draw path, submitting all
sub-draws in one GL call. So ADR-R09's premise that one BatchedMesh is a handful of draws holds on
WebGL2 but not on the WebGPU reference backend in r184: there a BatchedMesh costs one real encoder
call per visible instance.

Decision: keep BatchedMesh for the real city, whose geometries are unique so instancing does not
apply (ADR-R09), but stop using BatchedMesh for copies. The context ring was a BatchedMesh of one
shared box instanced about 550 times, which on WebGPU was about 550 separate draws for pure backdrop.
It is now one InstancedMesh, which the WebGPU backend draws as a single instanced draw; per-instance
transform and colour carry over unchanged (instanceMatrix and instanceColor through the node
material, bounding sphere recomputed from the instances so the ring still frustum-culls as a unit).

Measured: the conversion dropped the night draw count from 1885 to 1339 and lifted the WebGPU
reference from 54 to 59 fps (17.0 ms); the daytime wide shot, which also pays the cascaded-shadow
re-renders of the city, sits at 64 fps (15.7 ms). The WebGL2 fallback is unaffected, it already
collapsed the batch.

Consequences and the remaining lever: the real city is still about 1315 unique footprints, so it is
about 1315 encoder calls on WebGPU for the beauty pass and again per shadow cascade. That is the
dominant remaining draw cost and the next lever, most relevant to the daytime shadow work (Unit 8)
where the cascade re-renders multiply it. The intended fix is to merge the unedited buildings into
one static geometry (one draw, one per cascade) and promote a cluster to its own mesh only while it
carries a height edit, preserving ADR-R10 raycast selection and ADR-R11 per-cluster Y-scale. A three
version bump that adds WebGPU multi-draw-indirect for BatchedMesh would fix it without the rework and
is worth checking against the TSL and post stack first. The night frame is partly GPU-bound (window
emissive plus bloom over a bright skyline), so the city draw cut helps day more than night, but night
still gained from the context cut, so it is draw-sensitive too.

Two cheaper levers were tried and ruled out. The version bump is dead: r185's WebGPUBackend draws a
BatchedMesh with the same per-sub-draw loop as r184, byte for byte. The WebGPU render bundle
(BundleGroup) is also dead for this object: wrapping the city batch to record its draws once and
replay them froze the animated window-light uniforms (the per-frame refresh did not run on replay as
the source suggested) and disrupted the picking and pan event path, so it was reverted. The
merge-static rework remains the only viable lever, and it is deferred: the gate is met at 59 fps night
and 64 fps day, the rework is large, blind without on-device verification, and touches the core
select and edit interaction, so it waits until the daytime shadow work (Unit 8) measures whether the
shadow-pass cost actually needs it.

Alternatives rejected: keeping the context ring as a BatchedMesh (hundreds of needless draws on the
reference backend). Merging the whole city into one static geometry unconditionally (loses the
per-cluster height edit of ADR-R11 and the per-building selection of ADR-R10).

---

## ADR-R16: The sun-access study is an off-thread CPU heightfield raymarch, presented as exploratory measured geometry

Status: Accepted
Date: 2026-06-25

Context: the city already casts real shadows from real Toronto heights under the real astronomy-engine
sun (Lighting.tsx, CSM). Unit 8 turns that into a planner-grade instrument: pick an open space, and
read how much direct sun an edit takes from it across the Toronto tall-building shadow-study window
(equinox, 9:18 to 18:18). This is the rare feature where the most cinematic move and the most rigorous
one are the same: a measured shadow of a measured building under a measured sun. The line is held by
register (ADR-R07): it presents as a live exploratory study, never a stamped report, no badge, no
pass/fail verdict.

Decision, the parts that shipped:

Analysis region. data/ has no St. James Park polygon and nothing is fetched (bake-don't-fetch), so the
region is a user-placed, resizable, rotatable ENU rectangle, seeded from a hand-authored
data/study-regions.json default over the park. It renders as a luminous analysis overlay, never as a
measured Toronto feature, which holds the one line. Rejected: auto-deriving open space (illegible,
picks parking gaps), and requiring the user to paint before anything reads.

Accumulation method, revised from the plan. The Unit 8 plan proposed a GPU sun-rig (render the city
depth from the sun N times into render targets, accumulate on the GPU). That was revised to a CPU
heightfield raymarch in a Web Worker, for two reasons. First, the build is driven headless and the GPU
render-to-texture accumulator cannot be verified without the device, so it would have been many blind
verify-iterate cycles; the CPU math is pure and unit-tested in node before it ever runs on device.
Second, and decisive: the worker runs entirely off the frame loop, so the study never touches the
render budget no matter the sample count or resolution, which dissolves the very perf risk that made
the rig measurement (8.3) the gate. A max-height grid of the city is built once from the footprints,
and each region texel raymarches the grid toward each sun sample, adding the sample's trapezoidally
weighted hours when unoccluded. Measured on device: a study runs in 30 to 100 ms on the worker (more
in open areas, where rays travel far before clearing), an order of magnitude under budget. The result
field is graded into a heatmap (cool shadow blue to warm sunlit gold) baked CPU-side into a texture on
the region plane.

Cadence and the live loop. The study runs on demand (press U) and re-runs on every committed height
edit (the edit store version is polled, the re-run waits for the drag to end). The baseline is the
unedited city for the current region and date, cached and recomputed only when the region or date
changes; an edit recomputes just the current field (with the cluster Y-scale folded into the
heightfield heights) and diffs it. Net-new shadow is the mean sun-hours the edit removes from the
region, surfaced with the newly-shadowed area and a single bylaw dial (NET_NEW_THRESHOLD_HOURS),
shown as a line the delta crosses (amber over, green within), not a verdict. This closes the
edit-to-consequence loop, the same shape as the traffic re-solve (ADR-R13): raise a tower, its shadow
falls on the park, the panel ticks up the sunlight removed.

WebGL2. The study is CPU and backend-agnostic, so it runs identically on both paths, better than the
plan's "degrades on the fallback": the CSM being WebGPU-only does not matter because the study owns its
own occlusion math and never uses the CSM.

Register. Real heights, real sun, real Toronto zone, real date; stated plainly as that, presented as a
live exploratory study with the window and date always visible so the number is legible and
falsifiable. No seal, no compliance claim.

Consequences. The study adds zero frame-budget cost (off-thread), so the ADR-R15 merge-static rework is
not needed for Unit 8: the worry that the daytime accumulation would blow the budget is resolved by
construction. A supporting shadow-cost pass was needed first: at low sun a wide view was fill-bound to
24 fps, so the cascades were trimmed from four to three, the shadow map from 2048 to 1024, and maxFar
tightened to the city edge (the context ring casts no shadows), which restored the sunset budget, the
hero moment for a sun study. The heightfield is conservative (footprints solid to max height, holes
ignored) and stepped at the cell size, exploratory by intent. The net-new metric is a mean over the
region; a single tower may shade one corner hard yet move the mean modestly, so the dial is low and
tunable.

Alternatives rejected: the GPU sun-rig (correct and fast at runtime, but blind to build and carrying
the frame-budget risk the worker removes); sampling the view-fit CSM (wrong frame, couples the study to
the camera); a baked lightmap (loses edit-reactivity).

---

# Generative engine decisions (R17 onward)

These define the generative extension: describe a district and an agent conjures it in grounded,
cinematic 3D. They rest on one principle carried from ADR-004 and scaled from one building to a
district: creative intent lives in the agent, spatial correctness lives in code. Design rationale is
`docs/architecture.md` Part II (sections 11 to 20).

## ADR-R17: The agent emits district-level intent ops over real regions, never geometry

Status: Accepted
Date: 2026-06-25

Context: this is the seam the project turns on. The agent must express a brief ("car-free waterfront
for forty thousand, sunny park, towers stepping to the water") well enough to steer a refinement, but
must never do spatial layout, which is what LLMs are worst at. Too low-level (per-footprint ops) and the
agent drowns in coordinates and a district becomes thousands of tool calls. Too high-level (one
generateDistrict(prompt) op) and the agent cannot act on "denser near the water" without re-rolling
everything, and the procedural layer becomes an un-steerable black box.

Decision: a small closed op union, the descendant of the EditOp union (ADR-004, ADR-R11), of
district-level intent over real regions and anchors. Five ops: DefineDistrict (claim a region as the
canvas, with a seed), LayStreets (pattern, block size, primary axis, car-free), FillBlocks (program,
density or population target, height envelope, coverage), PlaceOpenSpace (a park reference and area
target), ApplyGradient (a height or density scalar field anchored to a real feature, the answer to
"stepping down to the water" and "denser near the water"). Plus a reference grammar: the agent names
real features (waterEdge, parkCentroid, realStreet, region, boundaryOf) rather than coordinates. Every
numeric is bounded; every op is Zod-validated; the agent emits no footprint, no centerline, no height in
metres at a coordinate. The boundary is sharp: the agent owns region, program, targets, envelope,
gradient, street pattern, what is car-free and where the park goes; the procedural layer (ADR-R18) owns
every centerline, intersection, block, lot, footprint, and per-building storey.

Consequences: one sentence of the brief maps to one op, and a refinement changes one parameter, so the
agent can steer. The op union is the strict tool surface the server-side loop constrains the model to
(ADR-R21), the same shape as today's edit_building tool. The vocabulary is the highest-risk design in
Part II and is expected to revise once after the agent stress-tests it (ADR-R21, the build flags this).

Alternatives rejected: per-footprint ops scaled up (drowns the agent in coordinates, thousands of calls
per district). A monolithic generateDistrict(prompt) (un-steerable, cannot refine one aspect, the
procedural layer becomes an un-decomposable mega-function).

## ADR-R18: Procedural expansion is deterministic, isomorphic, and instanced, grounded on the real plane

Status: Accepted
Date: 2026-06-25

Context: the ops (ADR-R17) must become grounded geometry that casts the real shadows and carries the
real flow, identically wherever it runs, and within the draw-call budget (ADR-R08, ADR-R15). The layer
both scores (server-side, in the agent loop) and renders (client-side), so it must run in both. And a
district of one to three thousand buildings cannot pay the WebGPU per-building draw cost a BatchedMesh
incurs (ADR-R15).

Decision: a pure, THREE-free, isomorphic module (src/generate) that expands an op list plus a seed into
a grounded district: resolve the region and anchors against real data, lay the street grid oriented to
the primary axis and stitch its perimeter to the real road graph, partition into blocks, subdivide
blocks into lots with one well-tested template, and mass each lot by extruding an inset footprint to a
height drawn from the envelope through any gradient field, snapped to whole storeys. A seeded PRNG makes
it deterministic to the bit, the same in node and the browser (the determinism contract, ADR-R21). The
generated massing renders as InstancedMesh templates (podium, slab, point tower) with per-instance
transform, footprint scale, and height, which on the WebGPU backend is one draw per template (ADR-R15
routes copies to InstancedMesh) and grows by incrementing the instance count with no geometry
reallocation. Start simple and grounded with the rectilinear grid; architectural variety (unique hero
extrusions, more templates) is a later upgrade.

Consequences: the same expander scores and renders, so the user sees exactly what the agent measured.
The instancing is most of the answer to live 60 fps (ADR-R08, the build proves it in G3). The street
pattern is coupled to the render budget: rectilinear grids instance cheaply and ship first, organic
grids need unique footprints and pay the BatchedMesh draw cost, deferred with variety. The lots are real
polygons on the real plane under the real sun; the template regularity is a render-and-scale choice, not
a loss of grounding.

Alternatives rejected: unique extruded footprints per generated building like the real city (full
variety but the ADR-R15 per-building draw cost, unaffordable at district scale, and a full rebuild on
every growth step). A GPU-side generator (blind to the headless scoring path and to node unit tests, the
same reason the study chose CPU in ADR-R16). Non-deterministic expansion (breaks the score-equals-render
contract and the agent's ability to refine one parameter).

## ADR-R19: Clear-and-generate in a designated zone via the overlay; the real city stays as grounding frame

Status: Accepted
Date: 2026-06-25

Context: the agent needs a canvas, and the brief is "a district grows from nothing." The options are
augmenting the real buildings in their gaps, clearing a zone and generating into it, or clearing
everything. The immutable-baseline-plus-overlay pattern (ADR-R11) must not be corrupted, and the
grounding (the moat) depends on real context staying visible.

Decision: the district op claims a region; the real building clusters inside it move into the overlay's
removed set (reversible, the baseline untouched); the generated massing and streets fill the cleared
zone; and the surrounding real Toronto, its streets, its towers, and the water edge stay as the grounding
frame and the cinematic continuation past the zone. The EditOverlay gains a generatedDistricts list (each
with its ops, seed, instanced placements, and street graph) and the cleared-cluster semantics; the street
and agent-graph overlays gain the stitched generated edges. The baseline model.buildings and data/ are
never mutated, so undo, reset, and the real-versus-proposal register fall out for free, exactly as a
height edit. The line (ADR-R07) is held by framing and by measured consequences, not by making the
proposal look fake: the generated district renders through the same PBR, IBL, and AgX pipeline and looks
fully real (the spectacle goal), while the UI states it is an agent-authored proposal whose consequences
are the measured ones. A restrained grade or boundary treatment may mark the zone as authored without
making it ugly.

Consequences: the overlay extension is small and reuses the undo and immutability of ADR-R11. The
contrast with real Toronto is preserved, which is the proof that the grounding is real. Clearing real
buildings is itself an overlay entry, so it is undoable.

Alternatives rejected: augment-only infill (St. Lawrence is dense, few gaps, and infill is not the "from
nothing" demo). Fully greenfield void (loses the grounding frame, the cinematic continuation, and with
them the moat). Holding the register by making the proposal look unreal (fights the spectacle mandate;
the differentiator is measured consequences, not a fake look).

## ADR-R20: The objective is tiered: hard-measured by simulators, enforced by construction, soft-judged by the agent

Status: Accepted
Date: 2026-06-25

Context: the agent must converge on a real objective, not vibes. Some goals are measurable, some can be
made true by how the geometry is built, and some are taste. Mixing them lets the agent assert success it
did not achieve, or search a space it does not need to.

Decision: three tiers. Hard-measured by simulators, the numbers the agent reads and steers against each
turn: sun-hours on a region (the study, ADR-R16), unit and population count (a new pure function over the
massing: footprint area times storeys times efficiency over unit size), reachability (ADR-R22), and
traffic load (the flow re-solve, ADR-R13, with demand generated from the district population). Enforced
by construction, which the agent never scores because the layer cannot violate them: "stepping down to
the water" is an ApplyGradient the massing samples, "car-free" is LayStreets carFree emitting no vehicle
edges. Soft-judged by the agent: coherence, whether it reads as a place, variety, with no number and no
tool. Convergence is over an objective vector with explicit tolerances (population band, park sun-hours
floor, reach ceiling, traffic ceiling) plus the free construction guarantees and the soft tier; the agent
iterates until the measured vector is in tolerance and no improving move remains, or a max-iteration
budget is spent, with a deterministic better-than comparator giving the loop a stopping condition. The
agent reports the measured vector every turn, so convergence is legible and falsifiable.

Consequences: the construction tier stays out of the agent's search entirely. The measured tier is the
moat (computed, not painted) and the agent's ground truth, above its own soft self-assessment. The
comparator and budget keep the loop from oscillating or gaming one metric (ADR-R21 flags those failure
modes). Unit count is the only new pure scorer; the other three are reused simulators.

Alternatives rejected: a single scalar objective (lets the agent trade the park's sun for population and
call it converged). Scoring the construction guarantees (wasted search on things that cannot be violated).
Letting the agent self-judge the hard metrics (defeats the measured-consequence moat).

## ADR-R21: The agent loop is server-side Claude tool-use; expander and scorers co-located; ops streamed to the client which re-expands

Status: Accepted
Date: 2026-06-25

Context: where the loop runs and how the build reaches the screen. The brief notes the simulators run
server-side, but the interactive study and flow were moved client-side for latency (ADR-R16, ADR-R13).
The apparent tension is resolved by the fact that the procedural layer and all the scorers are pure
TypeScript that runs identically in node (they are unit-tested there today). An iteration must be cheap
enough to run many times to convergence, and the build must stream so the user watches it live.

Decision: one server process runs the agent, the procedural expander (ADR-R18), and the scorers
(ADR-R20) together, so an iteration is a local function-call cycle with no client round-trip and no GPU.
A Next route handler (app/api/generate/route.ts, the descendant of app/api/edit/route.ts) hosts the loop
with claude-opus-4-8, the ADR-R17 ops as strict Zod-backed tool schemas, structured output and
tool_choice constraining the model to emit a valid op and never prose geometry. Each turn the agent gets
the brief, the city context, and the current proposal with its score vector, emits one op, and the server
expands, scores, and feeds the new vector back as the tool result. The stable city context (real parcels
and anchors, region, attribution, tool schemas, objective rubric) is a prompt-cache prefix, so every
iteration after the first reuses it. Each accepted revision streams its ops to the client over a
ReadableStream; the client applies them to the overlay, re-expands deterministically with the same seed
(the determinism contract, ADR-R18), and renders the build assembling and reshaping live. Internal
discarded trials need not stream, so the user sees a converging build. The client paths for live single
edits (ADR-R16, ADR-R13) stay; the loop just calls the same pure functions server-side.

Consequences: convergence is tight and local; the client is the theater, not the judge. This is the
existing mutation spine (server-side strict tool-use feeding the same ops the gizmos produce) scaled to a
multi-turn read-score-refine cycle with a richer union, a prompt cache, and a stream. Two risks ride
here: the agent oscillating or gaming a metric (bounded by the ADR-R20 comparator and budget), and the
op vocabulary needing a revision once the real agent reaches for an expression the union cannot form
(expected after this unit).

Alternatives rejected: a per-iteration client round-trip to score on the device simulators (network
latency multiplied by the iteration count, a chatty loop). Running the agent client-side (exposes the key
and the loop, and cannot prompt-cache or stream cleanly). Streaming geometry instead of ops (fatter
payload and discards the determinism contract that lets the client re-expand and proves score equals
render).

## ADR-R22: Reachability is a walk isochrone on the existing Dijkstra over the stitched graph

Status: Accepted
Date: 2026-06-25

Context: "a park reachable in five minutes" needs an isochrone on the road graph, and the question is
whether it is in scope and how it is exposed. The substrate exists: src/network/shortestPath.ts already
has shortestPathTree, a heap-based one-to-all Dijkstra with a dynamic per-edge cost. The one real
dependency is that walk reachability inside a just-drawn district depends on the streets the agent just
laid.

Decision: in scope, as a new thin module (src/reach) over the existing Dijkstra, no new graph algorithm.
A walk isochrone is shortestPathTree from a source over the walk graph with cost equal to length over
walk speed, thresholded at the time budget; "park reachable in five minutes" is, for every residential
lot, whether the nearest park entrance is within that isochrone. The procedural layer (ADR-R18) emits a
walk graph for the generated grid, stitched to the real network (the same boundary stitching the streets
already do), so the isochrone runs over one connected graph including the new streets. Exposed two ways,
the same dual life as the sun study: as an agent scoring tool (reachability(fromRegion, withinMinutes,
mode) returning the reached fraction and worst-case minutes, ADR-R20), and later as a live client overlay
painting the isochrone on the ground.

Consequences: a measured reachability number for the agent to converge against, cheap enough to run every
iteration (one Dijkstra tree). The generated walk graph and the stitching are the real work and land in
the build with the scoring tools (G4); the stitching is load-bearing for both reachability and traffic
and is flagged as easy to underestimate (architecture section 20).

Alternatives rejected: a Euclidean radius (ignores the street network and the car-free grid, so it is not
grounded). A new isochrone algorithm (the existing one-to-all Dijkstra already computes exactly the tree
an isochrone thresholds). Reachability only over the real graph (misses the district's own internal
walkability, which is the point of a car-free grid).

## ADR-R23: Cross-environment determinism and street-graph stitching are first-class gates

Status: Accepted
Date: 2026-06-25

Context: ADR-R08 made performance a release gate because it is the engine's one load-bearing falsifiable
claim. The generative engine adds two more claims that are just as load-bearing and, unlike performance,
fail silently rather than visibly. Both were flagged as risks in architecture section 20; this ADR
elevates them from prose risks to gates, the same move ADR-R08 made for frame time, so they are checked,
not hoped for. They fail quietly, which is exactly why they need a hard line.

Decision: define two gates, each with a check and a unit where it binds, and make passing them a release
condition the same way frame time is.

- The determinism gate. The procedural expander (ADR-R18) must produce bit-identical geometry from the
  same ops and seed in node and in the browser. The agent scores geometry server-side and the client
  renders from the same streamed ops (ADR-R21); if a PRNG or a float diverges between the two
  environments, the measured consequence the user sees silently does not match the city on screen, which
  breaks the moat without any visible symptom. The check is a cross-environment reproducibility test
  (expand a fixture op set in node and in a browser/worker context and assert the geometry hashes are
  equal), not only a node test. This constrains the PRNG choice and the arithmetic to be environment
  stable. It binds at G1 (the expander) and is re-asserted at G5 (the server-scores, client-renders
  loop).

- The stitching gate. The generated street grid must join the real road graph as one connected
  component, verified, before any reachability or traffic score is trusted. Walk reachability and flow
  both run over the stitched graph (ADR-R22, ADR-R13); a grid that looks connected but leaves the
  district a separate component yields a confidently wrong isochrone and a wrong flow, again with no
  visible symptom. The check reuses the existing connectivity analysis (src/network/connectivity.ts): the
  stitched graph must be a single strongly connected component reaching the district's lots from the real
  network. It binds at G1 (the stitch) and gates the scoring tools at G4.

Consequences: these two gates plus the ADR-R08 performance gate are the three release conditions for the
generative units. They are cheap to check and catch the two failures most likely to be hand-waved in
planning and silent in the build. The determinism gate constrains how the expander does arithmetic and
randomness from the first line of G1, rather than being retrofitted after a divergence is noticed in a
demo. The stitching gate makes the graph surgery a tested invariant, not an assumption the scorers
inherit.

Implementation status (G1b, 2026-06-25), recorded honestly rather than assumed: the determinism gate
currently proves V8 run-to-run determinism (the expander gives identical geometry across repeated runs
and is independent of map and set iteration order) plus a structural defense, the real divergence risk
is not the PRNG but transcendental functions in the geometry math, since Math.sin, Math.cos, and
Math.pow are at the mercy of the platform libm and are not bit-identical between V8 and JavaScriptCore,
so the expander is built to keep transcendentals out of the hot path entirely (the grid computes its
axis cos and sin once and reuses them, the gradient smoothstep is the pure polynomial 3t^2 - 2t^3, and
distance uses only Math.sqrt, which is IEEE 754 correctly-rounded and so bit-identical), making the gate
pass by construction. What is NOT yet verified: the true production split is node (V8) on the server
versus the user's browser engine, which on Safari is JavaScriptCore with a different libm, and that
node-versus-JavaScriptCore check is not reachable in the headless build, so it is unverified. A
node-versus-worker test would only re-prove V8-to-V8. The honest line, the same way Bill 17 is on the
record rather than assumed: the gate proves V8-to-V8 and by-construction transcendental avoidance today,
and JavaScriptCore parity is unverified until a real-browser determinism slice (a Playwright or WebKit
pass) is added, which is the right home for it at G5 where the server scores and the client renders.

Update (G5, 2026-06-27), the real-browser slice that G1b promised: the agent loop now carries the gate
live. The server emits the geometry signature of the district it scored (sandbox.signatureAll), the
client re-expands the same streamed ops and computes its own signature, and the AgentPanel compares them
(src/render/agentClient.ts). On device, a converged 8,000-resident run reported signature MATCH: the city
the browser rendered is bit-identical to the city the server scored, so the cross-process node-to-browser
gap is verified empirically, not assumed, on the demo engine. Precise scope, kept honest: the demo
browser here is Chromium (V8), so this verifies node-V8 server to browser-V8 client across two separate
builds and module instances (a real gap, since they bundle and run the expander independently), and it
confirms the by-construction transcendental avoidance survives that boundary. It does NOT yet exercise
JavaScriptCore: a Safari run is the one remaining check, and because the signature comparison ships in the
loop, it now runs automatically there too, so the JSC result will surface the first time the demo opens in
Safari rather than needing a separate harness.

Alternatives rejected: leaving both as section 20 risks (they fail silently, so a risk note does not
catch them; ADR-R08's precedent is that load-bearing falsifiable claims become gates). A node-only
determinism test (the divergence that matters is node versus browser, which a node-only test cannot see).
Trusting the stitch by construction without a connectivity check (the exact class of bug, a near-miss
snap that leaves a disconnected component, that construction confidence misses).

## ADR-R24: The generator is street-aware via a road-buffer mask; exact block derivation is deferred

Status: Accepted
Date: 2026-06-26

Context: G2 placed a generated block by filling a fixed rectangle over real ground, and on device it sat
on a road. The procedural layer had no knowledge of the real street network, so it cleared the buildings
and treated the whole rectangle, including the road right-of-way, as buildable. A proposal that builds on
the streets reads as broken and dissolves the grounding the moat depends on.

Decision: the expander is street-aware. The real street centerlines are passed in the generative context,
and the expander drops any lot whose centroid falls within a road buffer (default 10 m, 14 m for the G2
directive), so generated buildings never occupy the real road right-of-way. The mask is deterministic
(the roads are fixed input), so it stays inside the determinism gate (ADR-R23). The hard-coded G2
directive also lands on the real building cluster nearest the target and orients its grid to the bearing
of the nearest real street, so the block replaces a real parcel aligned to the grid instead of floating in
an intersection. Confirmed on device: the proposal sits on a real block, set back from the streets, the
sun study reads on it (4.1 h of 9.0 h, 75% sunlit for the sample), and the draw count stays flat, so the
ADR-R18 instancing holds (the proposal is a couple of draws, not one per building).

The exact form, deriving real block polygons as faces of the planar graph of the street network and
filling those, is deferred. The buffer mask is the right level for the single-block milestone and is the
same mask the agent's districts will use; planar face extraction is the later upgrade for when generation
spans many blocks and the fit must be exact rather than a setback.

Consequences: the generator respects the real streets by construction, which is the grounding the moat
depends on, and the achieved-units count stays honest because lots on roads are removed from the scored
massing, not merely hidden. The buffer is one tunable number, and a coarse lot grain against a large
buffer can over-drop lots in a small block, so the directive uses a finer setback than the default. The
deferred planar-face derivation is the dependency to revisit as districts grow (G3 onward).

Alternatives rejected: filling the rectangle and ignoring roads (builds on the streets, the bug this
fixes). Planar block-face derivation now (correct and exact, but graph work not needed to prove the
single-block milestone). A purely visual post-clip that hides on-road geometry without removing it from
the scored massing (the achieved-units count would then include buildings that are not really there,
breaking the measured-consequence honesty).

---

## ADR-R25: New-city gates are structural and analytic, not ground-truth; a structural pass is not a correctness pass

Status: Accepted
Date: 2026-06-27

Context: Toronto's verify gates rest on hand-curated ground truth (known-heights.json CTBUH towers,
known-routes.json measured distances, the placed cordon, the count stations). Those do not transfer to a
city we did not hand-check. The multi-city audit found the gates split cleanly: the structural and
analytic halves transfer, the ground-truth halves do not, and the ground-truth dependency concentrates
almost entirely in heights.

Decision: the per-city acceptance gate is structural and analytic only. The trichotomy: sun reduces to a
coordinate-and-geometry-correctness gate because the physics is universal (astronomy-engine is correct at
any lat/lon, the verify:solar assertions are analytic identities), so if the reprojection, the origin, and
the zone are right, the shadow is right anywhere; connectivity, reachability, and traffic gate structurally
on any city (single dominant SCC, a dominance threshold, zero-length and absurd-edge sanity, and the
self-contained ENU-vs-geodesic length cross-check that recomputes geodesic length from the ENU geometry
with no external truth); heights cannot be verified without an oracle and are not gated, they are labeled
(ADR-R26). The Toronto ground-truth gates (verify:heights entirely, the oneway, route, and alignment half
of verify:network, the count fit in verify:counts) are kept as a Toronto regression asset but are not part
of the per-city acceptance gate. A structural pass is explicitly NOT a correctness pass: a city can pass
every structural gate and still carry garbage heights, so structural soundness must never be read as
verification.

Consequences: any ingested city can be accepted automatically on structural and analytic grounds, which is
what unattended onboarding requires (ADR-R27). The danger is mistaking a green structural gate for a
verified city; the defense is that height confidence rides with every height-derived consequence (ADR-R26),
so a structurally sound city with weak heights produces visibly low-confidence numbers rather than silently
wrong ones. A legitimately split catchment is labeled, not failed, and the reachability isochrone is scoped
to the dominant component with that scoping surfaced, because an answer computed on a graph that silently
dropped part of the neighborhood is the confident wrong answer the project refuses.

Alternatives rejected: requiring per-city ground truth before accepting a city (blocks the many-cities
product, no oracle exists at scale). Hard-failing a split catchment (a disconnected catchment is data, not
breakage; scope and label it). Treating the structural gate as a correctness certificate (false, and the
exact failure mode that turns the solver into a liar).

---

## ADR-R26: Confidence is a first-class per-consequence output, propagated to the inputs that drove each consequence, not aggregated over the city

Status: Accepted
Date: 2026-06-27

Context: heights cannot be verified without an oracle, so they are labeled. The naive label is a per-city
aggregate, the fraction of measured versus estimated heights. That label is true about the city and useless
about a specific consequence: a park's sun-hours depend on the specific towers that shadow it, and if those
particular towers are the estimated-height ones, the park's sun number is garbage even though the city is
mostly measured. Aggregate confidence averages away the thing that matters, because the agent optimizes a
specific consequence against specific inputs, never the city mean.

Decision: confidence is a first-class output attached to every consequence the simulators return, and it
propagates to the specific inputs that drove that consequence, not the city aggregate. The drivers differ by
consequence. Sun-hours are driven by the occluders that actually cast shadow on the region, so the raymarch
attributes each lost sun-hour to its occluder and carries that occluder's height confidence, yielding a
per-consequence confidence that reflects the buildings that shadowed this region (generated towers are high
confidence, the proposal's own geometry; real towers carry their data provenance). Generated population is
high confidence because it is the proposal's own chosen heights. Reachability and traffic are
height-independent and carry structural and coverage confidence (the component scoping), plus the standing
demand-assumption caveat for traffic. The agent reads this per-consequence confidence in its score results
and the UI surfaces it, so the solver knows how much to trust its own evaluation on this city at this
location.

Consequences: the confidence is honest at the level the decision is made, not only at the level of the city.
This is the safety layer for unattended onboarding (ADR-R27): on a thin-data city a park shadowed by
estimated-height towers reads low-confidence and the agent and user both see it. It is more expensive than
an aggregate, because the raymarch must attribute shadow to occluders and carry their sigma, and that cost
is accepted because aggregate confidence is not a real safety layer. The detailed propagation design (shadow
attribution and sensitivity for sun, and the driver set per consequence) is the hardest part of the
multi-city unit and is specified before any code.

Alternatives rejected: a per-city aggregate height confidence (looks rigorous, is not, averages away the
drivers). A single global confidence per run (hides which consequence and which location is weak). Refusing
to report a consequence when any input is estimated (blocks almost every real city; the honest move is to
report with the propagated confidence, not to withhold).

---

## ADR-R27: Build toward open unattended onboarding; curated-first is a release strategy, so consequence-level confidence is cannot-ship-without

Status: Accepted
Date: 2026-06-27

Context: onboarding cities we select and curate is a different product from letting a user type any bounding
box and run the pipeline unattended. Curated is honest but slow and cannot let a user bring their own
parcel; open is the many-neighborhoods product and is dramatically harder, because no human is in the loop
to catch the messy-data failures the structural gate does not. The choice sets the standard the trust layer
must meet.

Decision: build the architecture and the trust layer toward open, unattended onboarding, and treat
curated-first as a release and go-to-market strategy, not an architecture decision. Because the destination
is open, the consequence-level confidence model (ADR-R26) is the entire safety layer between a user and a
confidently wrong answer on a city nobody vetted, which raises it from should-have to cannot-ship-without.
The structural gates and the confidence propagation are designed assuming no human in the loop from the
start, so flipping from curated to open is a release decision, not a rebuild. The milestone is pointed at
the open future: it includes a deliberately thin-data neighborhood as the unattended-ingestion stress test,
the case where only the confidence model protects the user.

Consequences: the trust layer is held to the unattended standard now, which is more work than curated would
need, and that work is the product's safety foundation rather than polish. The thin-data city moves into the
milestone, the test rather than the victory lap, because a confidence model that cannot make a
building:levels city honestly say "do not trust this park's sun" fails the open standard, and we want to
know that at the milestone, not after.

Alternatives rejected: building toward curated only (slower, smaller, and a user cannot bring their own
neighborhood, which is the actual product). Deferring the open decision until after the milestone (it sets
the trust-layer standard, so deferring under-scopes the hardest part of the unit). Shipping open onboarding
now (premature; the safety layer must prove itself on curated and thin-data cities first).

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
distinction is dropped. Realized in ADR-R13: building height now generates trips on top of the
cordon baseline, and the flow re-solves live on edit.

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
