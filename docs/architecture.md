# Massing, Architecture Reference (rebuild)

Status: target architecture for a cinematic, real-time, interactive city builder and
simulator on real Toronto data, now extended into a generative engine for the built world:
describe a district in plain English and an agent conjures it in grounded, cinematic 3D. This
document is the shared state. It supersedes the prior shadow-honesty architecture in full.
Settled decisions live in `docs/decisions.md` as ADRs; this document is the design and the
reasoning.

The document is in two parts. Part I (sections 1 to 10) is the rendering, simulation, and
interaction engine, built across Units 0 to 8 and now standing. Part II (sections 11 to 20) is
the generative extension: the two new subsystems (the procedural generation layer and the
generative agent loop) and how they compose with the engine.

Read sections 1 (identity), 3 (rendering), and 4 (simulation) first. They are the spine.
Section 8 is the original rebuild sequence (Units 0 to 8, complete). For the generative work,
read section 11 (overview and the spine principle), then 12 (the op vocabulary, make-or-break)
and 19 (the generative build sequence). Section 9 is the design work to commission.

---

## 1. Product identity

A cinematic creative simulator and sandbox. You fly through a gorgeous, physically lit 3D
slice of real Toronto, reshape it with the feel of a professional 3D editor, and watch the
city respond with immediate, legible, satisfying consequence. The bar is that a graphics or
simulation engineer leans in and asks "this runs in a browser?".

Two mandates, in priority order:

1. Functionality. A living, manipulable city. Reshape and watch. Latency is the enemy.
2. Front end. A cinematic look with no business running in a browser. Blender and Unreal
   register.

Spectacle, fluid interactivity, and plausible, legible simulation are the goals. Real-world
data is the canvas, not a contract. Validated accuracy is explicitly secondary.

The one line never crossed: do not dress invented simulation in the costume of authority.
No fake-precise numbers presented as measured truth, no badges implying validation that does
not exist. A value is either honestly grounded (the real Toronto height a building was
extruded from, the real road geometry) or it is clearly part of the simulated world (flow,
growth, agents). Inside that line, invent freely and go maximal.

This reorients the prior product, which framed itself as a forecasting and honesty-bands
instrument. The rebuild drops the honesty-theater apparatus (confidence badges, the
do-not-measure list, provenance-as-contract). It carries forward exactly one principle:
simulated values are never disguised as measured truth. In the new product that principle is
served by visual and linguistic register (simulated things look and read as simulated), not
by a badge subsystem.

### 1.1 The generative mandate (Part II)

The mandate now extends from reshaping the city to conjuring it. You type a brief, "a car-free
waterfront district for forty thousand people, maximum sunlight, a park reachable in five
minutes, towers stepping down to the water," and an agent grows a neighborhood out of nothing:
blocks and streets and glass towers assembling under golden-hour light, and when it settles the
sun-access heatmap blooms across the ground and traffic flows through the streets it just drew.
Then you say "denser near the water, keep the park sunny," and it reshapes live. The target is
that demo. Optimize for the gasp.

The moat is the grounding. Every other generative tool paints a plausible image. This one builds
on real parcels, real streets, and the real sun, and its consequences are computed, not painted:
the sun-hours on the park are raymarched against real geometry, the unit count is derived from
the massing, the five-minute reach is an isochrone on the real road graph. The grounding is not a
brake on the magic. It is the thing a competitor who just wraps an LLM cannot fake.

The architectural spine of the extension, which the rest of Part II elaborates: the agent emits
high-level creative intent, and a deterministic procedural layer turns intent into geometry. LLMs
are weak at spatial layout, so the agent never places a building by coordinate. It emits
generative directives over real regions, and a procedural generator expands them into real
footprints, heights, and streets on the real ground. Creative intent in the agent, spatial
correctness in code. This is the project's existing principle (the model never computes geometry,
it emits constrained ops, ADR-004) scaled from one building to a whole district.

---

## 2. What carries forward from the old build

The old repo is a shadow-honesty decision tool. Most of its value to the rebuild is in three
small, clean, well-tested modules and the baked data, not in its rendering or its honesty UI.

Kept as-is (the load-bearing real assets):

- The baked Toronto data in `data/`. `stlawrence.geojson` is 1315 building massing polygons
  with real `AVG_HEIGHT`, EPSG:3857. `network.json` is the OSM drivable road graph for the
  catchment. `traffic-counts.json`, `cordon.json`, `known-heights.json`, `known-routes.json`,
  `sources.json` round it out. This is the canvas. It stays.
- The coordinate frame. `src/coords/webmercator.ts` (3857 inverse) and `src/coords/enu.ts`
  (equirectangular tangent-plane to local ENU metres, with the `cos(lat0)` correction).
  Reproject through geodetic lon/lat to local ENU; never recenter in 3857 metres. This is
  correct and non-negotiable: Web Mercator inflates horizontal distance about 1.38x at
  Toronto's latitude, which would distort the entire city by 38 percent. Keep verbatim.
- The solar core. `src/solar/sun.ts` (astronomy-engine, refraction on, the ENU-to-Three axis
  mapping) and `src/solar/time.ts` (Toronto-zoned instants via luxon). Correct, isolated, and
  exactly what the time-of-day system needs. Keep, then extend (a sky/atmosphere model layers
  on top; the sun vector itself is done).

Reused with changes:

- The city-model loader and types (`src/model/`). The reprojection pipeline, two-pass origin
  computation, MultiPolygon explosion, and artifact filtering are reused. The `Provenance<T>`
  and `Confidence` wrappers on every field are stripped to a lean simulation model: a building
  is geometry plus a measured height plus a mutable per-frame simulation state. Provenance
  collapses to a single dataset-level source string for attribution.
- Footprint grouping (`src/model/grouping.ts`). The union-find clustering of podium and shaft
  polygons into logical buildings is reused for selection identity. The same algorithm; a
  leaner output type.
- The road network parser (`src/network/`). The typed directed graph, tag parsing, topology
  splitting, ENU reprojection against the shared origin, and connectivity analysis are reused
  as the substrate for the vehicle-flow system. The honesty-framed coverage stats are dropped.
- The mutation spine (`src/mutation/`, `app/api/edit/route.ts`). The closed `EditOp` union,
  the bounded-numeric Zod schema, the click-for-where plus language-for-what split, and the
  preview-diff-apply loop are a good interaction skeleton. They are rebuilt against the new
  editor (gizmos and direct manipulation become the primary path; language becomes one input
  among several) and expanded beyond add/modify/remove height.
- The traffic engine math (`src/traffic/assignment.ts`, BPR assignment). Reused as the
  coarse demand-to-flow solver that seeds the live agent simulation, recast from a validated
  wind tunnel into a spectacle-first flow field. The GEH count-validation harness
  (`src/traffic/validation.ts`) and the do-not-measure framing are dropped.

Demolished (out entirely, against the new identity):

- The honesty apparatus. `src/honesty/` (badges, bands, do-not-measure panel, the
  provenance-baked export footer), the confidence-band machinery, and the "calibrated
  instrument" UI language. This is the costume of authority the new identity refuses.
- The entire legacy presentation layer. `src/scene/*` and `src/ui/*` are R3F WebGL plumbing
  for a flat, diagrammatic look (single directional light, PCF shadows, flat-shaded extrusions,
  glass-panel readouts). The rebuild replaces it wholesale with a WebGPU pipeline. The
  geometry-building helpers in `src/scene/buildings.ts` (shape construction, axis mapping,
  merging) are a useful reference for the new BatchedMesh builder but are not kept.
- The validation harness and gates as a product surface. The scripts (`verify-heights`,
  `verify-solar`, `verify-network`, etc.) and `known-*.json` stay in the repo as developer
  sanity checks on the data, but they are no longer load-bearing and no longer gate the build.

---

## 3. Rendering pipeline

The look is lighting and post, not polygon count. The target register is high-end offline
render, reverse-engineered for real time. Nanite and Lumen are not in the browser, so the
perceived gap is closed where most of that quality actually lives: physically based materials,
image-based lighting, a real post stack, and deliberate art direction. Scale is handled by
WebGPU compute and instancing.

### 3.1 Renderer

Three.js `WebGPURenderer` (r171+; we are on r184). Async init with an automatic WebGL2 backend
fallback so the app still runs where WebGPU is unavailable. The fallback is a backend of the
same renderer, not a separate pipeline: TSL materials and the node post pipeline compile to GLSL
and run on WebGL2 too. What does not survive the fallback is the compute-dependent post passes
(GTAO, SSR, advanced TAA), which drop to a reduced subset there; the fallback is visibly lesser
by decision (ADR-R01), not a free degrade. React Three Fiber is the declarative layer, drei for
camera, controls, and helpers. Authored through R3F's WebGPU entry so the renderer, materials,
and node pipeline are one stack.

### 3.2 Materials and shading, TSL

All materials, shaders, post passes, and compute kernels are authored once in TSL (Three
Shading Language) and compiled to WGSL on WebGPU and GLSL on the fallback. No hand-written
WGSL or GLSL strings except where TSL genuinely cannot express a kernel. This is the single
biggest leverage point: one shader source, two backends, node-graph composability.

Buildings, ground, roads, and water use physically based node materials (metalness-roughness)
fed by the IBL environment. Buildings get subtle facade variation (procedural window grids,
per-building hue and roughness jitter, carried as per-object data on the BatchedMesh) so a city
of extruded prisms does not read as flat gray. Windows are emissive at night, driven by the
time-of-day uniform.

### 3.3 Lighting

- Image-based lighting from an HDRI environment map, prefiltered for specular and irradiance.
  The environment is the dominant ambient term and the source of believable reflections.
- One sun as a directional light, position driven by the existing astronomy-engine vector for
  the selected Toronto instant. The sun color and intensity are art-directed by time of day.
- Soft cascaded shadow maps (CSM) for the sun. The single shadow camera of the old build does
  not survive city scale at low sun; cascades give crisp near shadows and stable far shadows.
  Three to four cascades, tuned splits, PCF or PCSS-style softening that widens with distance.
- A small set of artificial lights at night (street and window glow) handled cheaply: mostly
  emissive materials plus bloom rather than many real light sources.

### 3.4 Post stack (node-based RenderPipeline)

The composed post chain, in order, built on the WebGPU node post pipeline (not the legacy
WebGL-only `EffectComposer`):

1. Ground-truth ambient occlusion (GTAO) for contact darkening and depth.
2. Screen-space reflections (SSR) for wet roads and glass, gated by roughness.
3. Depth of field, art-directed, restrained, stronger in cinematic camera moves.
4. Bloom on the emissive and high-luminance pass (windows, sun glints, wet highlights).
5. Volumetric light and atmospheric/height fog for depth and mood (god rays at low sun).
6. Temporal antialiasing (TAA), or subpixel morphological AA where TAA ghosts.
7. Tone mapping: AgX. Chosen over ACES for cleaner highlight desaturation and a more
   filmic, less orange shoulder, which flatters a city skyline at golden hour.
8. LUT-based color grading per time-of-day mood.
9. Restrained vignette, film grain, and chromatic aberration as the final filmic seasoning.

Every stage is a toggle and a strength uniform so the look is tuned with leva in development
and locked to art-directed presets at runtime.

This chain runs through the node post pipeline on both backends (ADR-R01). On the WebGPU backend
it runs in full; on the WebGL2 fallback the compute-dependent passes (GTAO, SSR, the temporal
history in TAA) drop, leaving tone mapping, a cheap bloom, fog, and grade as the known-good
subset. Proving the expensive, least-proven passes (GTAO and bloom) on the WebGPU node pipeline
through R3F is the explicit job of Unit 1; it is the seam most likely to be rough, more than the
PBR and IBL, which are well-trodden.

### 3.5 Performance

Performance is the enabler of fidelity. Targets and techniques:

- The static city renders in a handful of draw calls via `BatchedMesh`, not InstancedMesh: the
  1315 building polygons are unique geometries batched into one draw with per-object culling and
  selection (ADR-R09), roads likewise. Target at or under roughly 150 draws for buildings,
  roads, and ground combined.
- Asset compression: KTX2 (Basis) for textures, Draco for any loaded meshes.
- LOD and frustum culling for distant geometry; the city periphery drops to silhouettes.
- Baked AO and baked lighting for the static shell where it can be precomputed; dynamic
  lighting reserved for the sun sweep and night windows.
- GPU compute via WebGPU and TSL for anything that scales (agents, flow field, particles).
- Profiling is mandatory before optimizing: stats-gl for frame and GPU timing, plus
  `renderer.info` for draw calls, triangles, and texture/program counts. Findings recorded
  back into `docs/decisions.md` and the perf notes. The frame-time budget is a release gate, not
  a guideline: 60 fps on the WebGPU reference device and a 30 fps floor on the WebGL2 fallback
  device, and a milestone is not done until it holds on both (ADR-R08).

---

## 4. Simulation and systems

The architectural thesis: the same WebGPU layer renders the city and runs its simulation.
Data lives in GPU buffers; compute shaders advance it; the render reads it directly.

### 4.1 Data layout

Data-oriented design. Agents and any large simulated population are structure-of-arrays
(SoA): typed arrays per attribute (position, velocity, lane, destination, state), not arrays
of objects. This is cache-friendly on the CPU and maps one-to-one onto GPU storage buffers
when a system runs on compute. A light ECS-style registry tracks which systems own which
buffers and the order they run.

### 4.2 Fixed-timestep loop, decoupled from render

Simulation runs on a fixed timestep (60 Hz, `dt = 1/60 s`) fully decoupled from the render
loop. The render interpolates between the last two simulation states by an alpha so motion is
smooth at any display rate, and the simulation is stable and deterministic independent of
frame rate. An accumulator drains real elapsed time into fixed steps, clamped to avoid the
spiral of death when a tab stalls.

### 4.3 Systems

City systems that make the place feel alive and consequential when reshaped. Each must read
clearly on screen.

- Time and sky. The clock advances (scrubbable and playable). Sun vector from
  astronomy-engine; sky color, fog, light intensity, and window emissivity are art-directed
  functions of the time. This is the cheapest, most cinematic system and ships first.
- Weather and mood. Clear, overcast, rain. Rain wets roads (raises SSR and lowers roughness),
  adds particles, shifts the grade. A deliberate, art-directed set of moods, not defaults.
- Vehicle and pedestrian flow on the real network. The OSM graph carries a flow field from
  the BPR solver (reused math); agents are spawned onto edges as instanced meshes and advanced
  on the GPU, density and speed from the flow field. This is the headline "alive" system.
- Density and growth. Rezoning or adding capacity triggers visible, legible change over time:
  lots fill, heights rise, lights come on. Growth is plainly part of the simulated world.
- Light and shadow as a system: the sun sweep is itself a consequence the user drives.

Spatial partitioning (a uniform grid over the ENU plane) serves neighbor queries for agents
and broad-phase culling. Systems are stable, debuggable, and hot-reloadable: a system is a
pure step over its buffers plus a setup, so it can be swapped without reloading the city.

### 4.4 CPU/WASM versus GPU compute

The decision per system is clarity versus scale:

- GPU compute (TSL): agent advection along the flow field, particle systems, the flow field
  itself once it is large, any per-instance animation. These scale to tens of thousands and
  belong on the GPU.
- CPU (TypeScript), or Rust-to-WASM where the logic is clearer or hot: graph routing
  (Dijkstra over the network), the BPR assignment increments, growth rules, selection and
  edit application. WASM is held in reserve for a profiled CPU hotspot, not adopted up front.

The seam is explicit: a system declares whether it steps on CPU or GPU, and the buffer
ownership registry makes the handoff (CPU writes demand, GPU reads it to advect agents)
legible and testable.

---

## 5. Interaction and the editor

The feel of a professional 3D editor. Latency is the enemy of the feeling of power; prefer
in-world feedback over chrome.

### 5.1 Camera

- Orbit camera (drei) for inspection, with damping, sensible min/max, and framing on
  selection.
- Fly camera for cinematic traversal through the streets.
- Smooth transitions between framed targets; the camera is itself a cinematic instrument.

### 5.2 Selection and manipulation

- Crisp hover and selection on buildings (cluster identity from the reused grouping), roads,
  and lots. Hover is an in-world highlight (outline or emissive rim), not a tooltip.
- Transform gizmos for move, rotate, and scale (height) on the selected entity, with
  immediate geometry response and live shadow/flow re-evaluation.
- Direct manipulation is the primary edit path. Natural language (the reused EditOp loop) is a
  secondary, fast path for "make this 40 storeys" or "add a tower here" that resolves to the
  same EditOp set the gizmos produce.
- Every manipulation produces an immediate, legible, satisfying response: the shadow moves,
  the flow reroutes, the skyline changes, all in-world and at interactive latency.

### 5.3 Panels and tools

- A tool palette (select, move, add, rezone, weather, time).
- A dockable inspector and property panels in a refined dark professional-tool aesthetic with
  real typographic and spacing discipline (consult the frontend-design skill; design tokens
  produced in Claude Design per section 9).
- Panels are DOM overlay (React), not in-canvas, kept minimal so the world is the interface.

---

## 6. Data and city-model layer

The data pipeline is largely the old one, stripped of provenance ceremony.

- Bake, do not fetch. The snapshots in `data/` are the single source; nothing is fetched at
  build or runtime. The app pre-resolves the city model at build (server component) and hands
  a slim payload to the client, exactly as today.
- Reprojection: 3857 to geodetic to local ENU against a computed centroid origin, shared by
  buildings and roads so they co-register by construction. Unchanged.
- The simulation city model: per building, the footprint (ENU rings), the measured height,
  the cluster identity, and a mutable simulation-state slot. Per road edge, the directed
  geometry, capacity attributes, and a flow-state slot. Origin and source attribution string
  for the credit line. No per-field provenance wrappers, no confidence bands.
- User edits live in an overlay over the baked model (reused pattern), so real Toronto and the
  user's changes stay separable for undo and for the simulated-versus-grounded register.

---

## 7. How it composes

```
data/ (baked snapshot)
  -> model layer (load, reproject, group)        [build time, server]
  -> simulation city model + GPU buffers          [client init]
       |                                   |
       v                                   v
  simulation systems (fixed step)     rendering pipeline (WebGPU + TSL + post)
       |   ^                               ^
       |   | edits                         | reads sim buffers, interpolated
       v   |                               |
  interaction/editor (gizmos, NL, camera, panels)
```

The renderer and the simulation share the WebGPU device and the SoA buffers. The editor
mutates the model and the simulation responds; the renderer always draws the latest
interpolated state. Time, weather, and flow are systems on the fixed loop; selection and edits
are events into it.

---

## 8. Rebuild sequence

Smallest shippable units, each a clean conventional commit, from the current repo to the
first demonstrable milestone and on toward the vision. Plan only; do not start until the
sequence is approved.

### Unit 0: demolition and skeleton

Remove `src/honesty/`, `src/scene/`, `src/ui/`, the gate scripts as build dependencies, and
the old `app/page.tsx` wiring. Keep `src/coords/`, `src/solar/`, `src/model/` (to be slimmed),
`src/network/`, `src/mutation/` (to be reworked), `src/traffic/assignment.ts`, and all of
`data/`. Decide the build setup per ADR-R02. Stand up an empty WebGPU R3F canvas that clears
to a graded color and confirms WebGPU init with WebGL2 fallback. Commit.

### Unit 1: the city renders, lit and grounded (the first milestone)

The building city from the baked snapshot as a single `BatchedMesh` (ADR-R09), sitting in a
world rather than floating on a bare plane: a real PBR ground material, a contact shadow
grounding each building, and atmospheric fog for depth, under the WebGPU pipeline (PBR
materials, HDRI image-based lighting, AgX tone mapping, cascaded sun shadows). Orbit camera
framed on the neighborhood. The sun driven by the existing astronomy-engine vector at a fixed
art-directed golden-hour instant.

The de-risk this milestone exists to prove is the post path specifically: GTAO plus bloom on
the WebGPU node post pipeline through R3F. That is the thin ice (ADR-R01), more than the PBR and
IBL, which are standard. The milestone is not done until it holds the performance budget on both
the WebGPU reference device and the WebGL2 floor device (ADR-R08), and until BatchedMesh under
TSL node materials is confirmed on both backends.

This is the right first milestone because it is the smallest thing that delivers the core
promise and de-risks the hardest claim. When it is done the user orbits a real slice of Toronto
that looks like an offline render, grounded in a believable world rather than a tech-demo void,
and asks "this runs in a browser?". Everything after it is additive against a proven visual
spine.

### Unit 2: ground, streets, and surrounding context

Extend the world past the data slice so the city does not end at a hard clip edge. A larger
ground extent, the road surfaces rendered as static street geometry (the network as ground
detail, before any flow runs on it), and a faded ring of surrounding-city massing or silhouette
so the neighborhood reads as part of a larger Toronto. Height and distance fog (section 3.4)
carry the periphery into haze. No simulation yet; this is the static world the dynamic systems
will inhabit.

This lands second, immediately after the lit milestone and before the dynamic systems, because
a hard clip edge breaks the cinematic illusion the instant the camera pulls back, no matter how
good the lighting is. Fixing the world's extent is foundational to the look, so it precedes
time, weather, and flow. The split with Unit 1 is deliberate: Unit 1 grounds each building in
its immediate surroundings (ground, contact shadow, fog); Unit 2 extends those surroundings
outward to the horizon. The split with the flow unit is also deliberate: Unit 2 renders the
streets as static surfaces, the flow unit later puts living traffic on them.

### Unit 3: time of day, live

The sun sweep becomes interactive: scrub and play the Toronto clock; sky, fog, light color,
shadow direction, and night window emissivity all respond. The cheapest, most cinematic
system, and it makes the static city move.

### Unit 4: selection and the editor spine

Hover and selection on buildings (reused grouping), an in-world highlight, a transform gizmo
for height, and the reworked EditOp apply path so a building's height changes with an immediate
shadow response. Natural-language height edit reattached as the secondary path.

### Unit 5: the network and live flow

Render the road network in the new pipeline; run the BPR flow field on the reused engine; spawn
instanced vehicle agents advected along edges on GPU compute, density and speed from the flow.
The headline "alive" system. Rezoning or adding capacity visibly reroutes traffic.

### Unit 6: weather and mood

Clear, overcast, and rain as art-directed presets: wet-road SSR, rain particles, mood-specific
LUT and fog. The look gains range.

### Unit 7: growth and consequence chains

Adding or rezoning triggers legible change over time (lots fill, heights rise, lights come on),
closing the reshape-and-watch loop into the full vision.

Later units: pedestrian agents, richer facade and material variation, cinematic camera paths
and a capture/record mode, additional neighborhoods.

---

## 9. Design artifacts to commission (Claude Design)

Produce these before or alongside the build and hand them back. Be specific:

- Mood and lighting targets. Three to five reference frames of the city at golden hour, blue
  hour, overcast day, and clear night. For each: sun color and angle, sky and fog color, key
  ambient ratio, and the overall grade. These set the art direction sections 3.3 and 3.4 tune
  against.
- The color and type system. A dark professional-tool palette (surfaces, hairlines, ink
  levels, accent, semantic colors for selection and simulated-versus-grounded), and a type
  scale with one display and one UI family, sizes, weights, and spacing tokens. This replaces
  the old `src/ui/theme.ts`.
- The editor interface. Layout for the tool palette, the dockable inspector and property
  panels, and the time/weather controls. Docking behavior, panel anatomy, empty and selected
  states.
- Gizmo and selection design. The visual language of hover, selection, and the transform
  gizmo in-world: outline/rim treatment, gizmo handles and colors, the height-drag affordance,
  and the simulated-versus-grounded visual register (how a hypothetical building reads as
  hypothetical without a badge).
- Per-mood LUTs (or the color targets to derive them) for section 3.4 stage 8.

---

## 10. Risks, flagged once

- The post stack on WebGPU through R3F, not WebGPU itself. WebGPU browser support is broad in
  2026; the thin ice is the node-based post pipeline (GTAO, SSR, TAA as TSL nodes), which is
  newer, has fewer built-in effects, and far less R3F integration than the mature pmndrs WebGL
  `EffectComposer` stack engineers reach for by reflex. The WebGL2 fallback does not get this
  look for free: it is the same node pipeline minus its compute-dependent passes, a materially
  lesser result accepted by decision (ADR-R01), not a separate pmndrs pipeline. Mitigation:
  every post stage is a toggle, Unit 1 exists specifically to prove the GTAO-plus-bloom post path
  before anything is built on it, and the performance gate (ADR-R08) sizes the stack to the frame
  budget on both paths.
- Determinism on GPU compute. Floating-point reductions on the GPU are not bit-identical
  across hardware. The fixed-timestep loop keeps the simulation stable, but exact determinism
  is not promised for GPU systems. This is acceptable: the product is a creative simulator, not
  a forecasting tool, and the one line we hold is register, not reproducibility.

---

# Part II: the generative engine

Part I built the engine: the lit, grounded city, the simulators, the editor, the overlay. Part II
turns it into a generative engine for the built world. Two new subsystems, everything else reused:

1. The procedural generation layer, the hands. Typed generative ops over real regions that
   deterministically produce grounded massing and streets, casting real shadows and real flow.
   Built and gated first, with no agent involved.
2. The generative agent loop, the mind. Goal in, the agent emits generative ops into a sandbox
   overlay, the procedural layer builds them, the simulators score the result, the agent reads
   the deltas, critiques itself, refines, converges, and presents, streamed to the renderer so
   the user watches it build live.

The whole of Part II rests on one principle, restated because every decision below is a
consequence of it: creative intent lives in the agent, spatial correctness lives in code. The
agent expresses goals and shaping fields over real regions; the procedural layer owns every
coordinate. The boundary between the two (section 12) is the make-or-break design.

---

## 11. Overview and the data flow

The generative loop is a closed cycle that the user watches from the outside:

```
brief ("car-free waterfront for 40k, sunny park, towers to the water")
  -> agent (server, Claude tool-use, opus-4-8)
       emits generative ops over real regions
  -> procedural layer (pure TS, server side this turn)
       expands ops + seed -> grounded district (footprints, heights, street graph)
  -> simulators (pure TS, server side this turn)
       sun-hours, unit count, reachability, traffic -> a score vector
  -> agent reads score deltas, critiques, refines ops  --\
       (loop until the objective vector is met or budget spent)
  -> on each accepted revision, stream the ops to the client
  -> client re-expands the same ops + seed (determinism) and renders
       the district assembling live; study heatmap blooms; flow runs
```

Two facts make this tractable, both inherited from Part I rather than invented:

- The procedural layer and the simulators are pure TypeScript. The study raymarch, the BPR solve,
  and the Dijkstra tree already run headless in node (they are unit-tested there today). So an
  iteration of the loop needs no client round-trip and no GPU: the agent, the expander, and the
  scorers all run in one server process, tight and fast. The client is the theater, not the
  judge.
- The procedural layer is isomorphic. The same expander runs in node (to score) and in the
  browser (to render), like the `src/solar` and `src/study` split. The server scores geometry A;
  the client, fed the same ops and seed, renders the identical geometry A. The user sees exactly
  what the agent measured. This determinism contract is load-bearing for the moat (section 20).

This resolves an apparent tension in the brief. The interactive simulators (the study worker,
the flow re-solve) were deliberately moved client-side in Part I for latency (ADR-R16, ADR-R13).
The agent loop does not contradict that. It calls the same pure functions server-side, where the
loop lives; the client paths stay for live single edits. The math is portable by design, so it
runs wherever the caller is.

---

## 12. The generative op vocabulary (Decision 1, make-or-break)

This is the seam the whole project turns on. Too low-level and the agent drowns in coordinates,
which is the failure mode of asking an LLM to do spatial layout. Too high-level and the agent
cannot express the goal or steer a refinement, and the procedural layer becomes one
un-steerable black box.

The resolving idea: the agent emits intent over real regions and anchors, never geometry. An op
carries a program, a target, an envelope, or a field, plus references to real features (a region,
the water edge, the park). It never carries a footprint, a street centerline, or a height in
metres at a coordinate. Every numeric is bounded. The procedural layer (section 13) turns each op
into geometry deterministically.

The vocabulary is a small closed union, the direct descendant of the `EditOp` union (ADR-004,
ADR-R11). Five intent ops plus a region/anchor reference grammar:

- `DefineDistrict { region, seed }`. Claim a region of real ground as the generative canvas. The
  region is a reference (section 14): an ENU rectangle or polygon, or a named handle the agent
  was given in its context (for example "the cleared waterfront zone"). The seed pins the PRNG so
  the district is reproducible and re-expands identically on the client. Everything else targets a
  district by id.

- `LayStreets { district, pattern, blockSize, primaryAxis, carFree }`. The street directive.
  `pattern` is an enum (`grid`, `perimeter`, later `organic`); `blockSize` a bounded metre range;
  `primaryAxis` a reference (`parallelTo: waterEdge`, or a bearing) so the grid orients to a real
  feature; `carFree` flags the streets pedestrian (no vehicle edges emitted, so car-free is true
  by construction, section 15). The procedural layer decides every centerline and every
  intersection, and stitches the grid to the surrounding real road graph at the boundary.

- `FillBlocks { district, program, density, heightEnvelope, coverage }`. The massing directive.
  `program` is `residential | office | mixed`; `density` a target (units per hectare, or a
  district population target the layer divides out); `heightEnvelope` a bounded storey range,
  optionally keyed to a gradient (below); `coverage` the share of each lot the building occupies.
  The layer subdivides blocks into lots and extrudes a building per lot, heights drawn from the
  envelope evaluated at the lot position. The agent says "twenty-storey residential at this
  density"; the layer decides the lots and the exact per-building storeys.

- `PlaceOpenSpace { district, where, area }`. Reserve a park or plaza. `where` is a reference
  (a sub-region, or "near the water", or "central"); `area` a target. The layer removes those
  blocks from the fill and grounds the open space, which the sun-access and reachability tools
  then score.

- `ApplyGradient { district, field, anchor, falloff }`. The shaping field, and the answer to
  "stepping down to the water" and "denser near the water". `field` is `height | density`;
  `anchor` a real reference (the water edge, the park centroid); `falloff` how the scalar decays
  with distance from the anchor. The gradient is a function the `FillBlocks` expansion samples per
  lot. It is how a single sentence reshapes a whole district's massing without naming one
  building.

The reference grammar (regions and anchors) is the second half of the vocabulary and just as
important. The agent never invents a coordinate; it names a real feature the procedural layer
resolves: `waterEdge`, `parkCentroid`, `realStreet(name)`, `region(id)`, `boundaryOf(district)`.
These are resolved against the baked data and the current overlay, so "parallel to the water" and
"reachable from the park" mean something concrete.

The boundary, stated once and sharply. The agent owns: which region, which program, the density
and population targets, the height envelope and its gradient, the street pattern and block scale,
where the park goes, what is car-free. The procedural layer owns: every street centerline, every
intersection and its connection to the real graph, every block boundary, every lot split, every
footprint polygon, every per-building storey count within the envelope. The agent expresses the
place; the code places the geometry.

Alternatives rejected. Per-footprint ops (`AddBuilding at (e,n)` scaled up) drown the agent in
the exact coordinate work LLMs are worst at, and make a forty-thousand-person district thousands
of tool calls. A single monolithic `generateDistrict(prompt)` op pushes all intent into one
opaque call the agent cannot steer: it could not act on "denser near the water" without
re-rolling everything, and the procedural layer would become an un-decomposable mega-function. The
five-op middle is the level at which one sentence maps to one op and a refinement changes one
parameter.

---

## 13. The procedural generation layer, the hands (Decision 2)

A pure, deterministic, isomorphic module (`src/generate/`) that expands an op list plus a seed
into a grounded district. THREE-free so it unit-tests in node and runs identically server-side
(to score) and client-side (to render), the same discipline as `src/study`. Start simple and
grounded; architectural variety is a later upgrade.

The expansion pipeline, in order:

1. Resolve the district region and anchors against the real data and the overlay. The water edge,
   the park reference, and the real boundary streets become concrete ENU geometry.
2. Lay the street grid. For the `grid` pattern: a parametric lattice oriented to `primaryAxis`,
   spaced by `blockSize`, clipped to the district boundary. The critical step is stitching: the
   generated grid's perimeter intersections are connected to the nearest nodes of the real road
   graph, so the new streets are part of one connected network. This stitching is what makes
   reachability and traffic flow through the district rather than around it (section 20 flags it).
3. Partition into blocks. The street centerlines bound the blocks; each block is the polygon
   between four streets, inset by the street half-width.
4. Subdivide blocks into lots. Start with one well-tested template: a recursive oriented-bounding-
   box split to a target lot size, or perimeter-block lotting for the `perimeter` pattern. Lots
   are grounded polygons on the real plane.
5. Mass each lot. Inset the footprint by `coverage`, extrude to a height drawn from
   `heightEnvelope` evaluated through any `ApplyGradient` field at the lot centroid, snapped to
   whole storeys at the model's real `metresPerStorey`. Reserve `PlaceOpenSpace` blocks as ground,
   not massing.

Determinism is the contract. A seeded PRNG drives every choice (lot jitter, height within the
envelope band, template selection). The same ops and seed produce the same geometry to the bit,
in node and in the browser. This is why the agent can refine: re-expanding with one changed
parameter changes only what that parameter touches, and the client render matches the server
score exactly.

Geometry strategy and the draw-call coupling. The real city is unique extrusions in a BatchedMesh
(ADR-R09), which on the WebGPU backend costs one draw per building (ADR-R15). A generated district
of one to three thousand buildings cannot pay that. The generated massing is therefore built to
instance: a rectilinear grid yields regular, near-rectangular lots, so the massing is a small set
of extrusion templates (podium, slab, point tower) placed as InstancedMesh with per-instance
transform, footprint scale, and height. On WebGPU that is one draw per template, not per building
(ADR-R15 already routes copies to InstancedMesh), and growing the district is growing the instance
count with no geometry reallocation, which is most of the answer to live 60 fps (section 20). The
grounding is preserved where it matters: the lots are real polygons on the real plane under the
real sun; the regularity is a render-and-scale choice, not a loss of grounding. Variety comes from
template count and per-instance jitter now, and unique extrusions for hero buildings later. This
couples the street pattern to the render budget: rectilinear grids instance cheaply, organic grids
need unique footprints and pay the draw-call cost, so `grid` ships first.

---

## 14. The canvas and the overlay extension (Decision 3)

Whether the agent generates onto cleared ground or augments the real buildings, and how much real
context stays.

Decision: clear-and-generate in a designated zone, keep the rest real. The district op claims a
region; the real building clusters inside that region move into the overlay's removed set
(reversible, the baseline is never touched); the generated massing and streets fill the cleared
zone; and the surrounding real Toronto, its streets, its towers, the water edge, all stay as the
grounding frame and the cinematic continuation past the generated zone. This is the demo: a
neighborhood grows out of nothing inside the zone while the real city frames it and the camera
flies on past the edge into real Toronto.

This reuses the immutable-baseline-plus-overlay pattern (ADR-R11) exactly, extended from
single-building edits to a district. The current overlay holds `removedClusterIds`,
`modifiedClusterHeights`, and `addedBuildings`. The extension adds a district object:

- `removedClusterIds` gains the real clusters inside the zone (reversible clearing).
- A new `generatedDistricts: GeneratedDistrict[]`, each holding its op list, seed, expanded
  buildings (as instanced template placements), and its street graph.
- The street overlay gains the generated centerlines, rendered through the existing `Streets`
  path, and the walk/drive graph gains the stitched generated edges for the simulators.

The baseline `model.buildings` and `data/` are never mutated, so undo, the real-versus-proposal
register, and a clean reset all fall out for free, the same as a height edit. Clearing real
buildings is itself an overlay entry, so "put it back" is undo.

The register, reframed as the moat. The generated district renders through the same PBR, IBL, and
AgX pipeline as the real city, so it looks every bit as real: that is the spectacle goal, not a
problem to hide. The line (ADR-R07) is not held by making the proposal look fake. It is held by
framing and by measurement: the UI states plainly that this is a proposal the agent authored, and
its consequences are the measured ones (sun-hours raymarched, units counted, reach computed). A
restrained grade or boundary treatment on the zone can mark it as authored without making it ugly.
The differentiator is never "the generated city looks unreal." It is "the generated city's
consequences are real."

Alternatives rejected. Augment-only (add buildings in the gaps of the real city): St. Lawrence is
dense, there are few gaps, and "a district grows from nothing" is the demo, not infill. Fully
greenfield void (clear everything): loses the grounding frame and the cinematic continuation, and
with them the moat, since the contrast with real Toronto is the proof that the grounding is real.

---

## 15. The scoring and objective model (Decisions 4 and 5)

The agent must converge on a real objective, not vibes. Goals fall into three tiers by how they
are enforced, and the tier decides whether the agent ever has to think about them.

Hard-measured by simulators (the moat). These are computed numbers the agent reads each turn and
steers against, each a pure function exposed as a scoring tool:

- Sun-hours on a region. The Unit 8 study (ADR-R16): the off-thread heightfield raymarch over the
  Toronto shadow-study window, returning mean sun-hours and the field over a park or plaza. Reused
  verbatim; the region is the generated park.
- Unit and population count. New but trivial and pure: sum over the generated massing of footprint
  area times storeys times an efficiency factor divided by an average unit size. Deterministic
  from the geometry the layer just built, so "forty thousand people" is a number the agent hits by
  tuning density and envelope, not a claim.
- Reachability (section below). The isochrone tool: is the park within a five-minute walk of the
  district's homes.
- Traffic load. The BPR re-solve (ADR-R13) on the stitched graph: does the new district overload
  its access roads. Reused; demand is generated from the district's population.

Enforced by construction (the agent never scores these, the layer cannot violate them). "Towers
stepping down to the water" is an `ApplyGradient` the massing samples, so a violated step-down is
impossible by construction; the layer builds it correct. "Car-free" is `LayStreets carFree`, so no
vehicle edges exist in the zone. These are guarantees, not objectives, which keeps them out of the
agent's search space entirely.

Soft-judged by the agent. Coherence, whether the massing reads as a place, variety, composition.
The agent critiques these from the streamed result and its own judgment. They have no number and
no tool; they are the residue the hard metrics and the construction guarantees do not cover, and
the agent is allowed to use taste there.

Convergence. The objective is a vector with tolerances: population within a band, mean park
sun-hours at or above a floor, park reach at or under five minutes, traffic under a ceiling, plus
the construction guarantees (free) and the soft judgment. The agent iterates ops until the
measured vector is in tolerance and no improving move remains, or a max-iteration budget is spent.
A deterministic "is this better" comparator over the vector gives the loop a stopping condition, so
it converges instead of oscillating (section 20 flags the failure modes). The agent reports the
score vector every turn, so convergence is legible and falsifiable, not asserted.

### 15.1 Reachability, the new consequence tool (Decision 5)

In scope, and cheap, because the substrate exists. `src/network/shortestPath.ts` already has
`shortestPathTree`, a heap-based one-to-all Dijkstra with a dynamic per-edge cost. A walk isochrone
is that tree from a source over the walk graph with cost = length / walk speed, thresholded at the
time budget. "A park reachable in five minutes" is: for every residential lot, is the nearest park
entrance within the five-minute isochrone.

The one real piece of work is the graph. Walk reachability inside a just-drawn district depends on
the streets the agent just laid, so the procedural layer must emit a walk graph for the generated
grid, stitched to the real network (the same stitching as section 13 step 2). With the stitched
graph, the isochrone is a single Dijkstra tree, fast enough to run every iteration.

Exposed two ways. As an agent scoring tool (`reachability(fromRegion, withinMinutes, mode)`
returning the reached fraction and the worst-case minutes), and later as a live client overlay (the
isochrone painted on the ground), the same dual life as the sun study. New module `src/reach/`,
built on the existing Dijkstra, no new graph algorithm.

---

## 16. The generative agent loop, the mind (Decision 6)

Confirmed: server-side Claude tool-use, `claude-opus-4-8`, strict tools and structured output,
prompt-cached city context, ops streamed to the client. The detail:

Topology. One server process runs the agent, the procedural expander, and the scorers together
(section 11), so an iteration is a local function-call cycle with no client round-trip and no GPU.
A Next route handler (`app/api/generate/route.ts`, the descendant of `app/api/edit/route.ts`)
hosts the loop and streams to the client over a `ReadableStream` (SSE-style). The expander and
scorers are the same pure modules the client uses, imported server-side.

The turn. The agent is given the brief, the city context, and the current proposal with its score
vector, and must call one of the generative tools (the section 12 union, as strict Zod-backed tool
schemas with bounded numerics and reference enums, exactly like the `edit_building` tool today but
richer). Structured output and `tool_choice` constrain it to emit a valid op, never prose
geometry. The server expands the op into the sandbox overlay, scores the result, and feeds the new
score vector back as the tool result. The agent reads the deltas, critiques, and emits the next op,
or signals convergence.

Prompt caching. The stable city context (the real parcels and anchors in the district's
neighborhood, the region definition, the data attribution, the tool schemas, the objective rubric)
is a single cache-control prefix, so every iteration after the first reuses it and only the
changing tail (the latest score vector and the agent's running plan) is fresh tokens. This is what
makes a multi-turn convergence loop affordable.

Streaming and the watched build. Each accepted revision streams its ops to the client, which
applies them to the overlay, re-expands deterministically (same seed), and renders. The client
animates the transition: blocks rise, the grid draws, heights re-step when a gradient changes, the
park moves. The user watches the district assemble and then reshape as the agent refines, which is
the spectacle ("denser near the water" visibly reshaping is the gasp). Internal trial iterations
that the agent discards need not stream; the stream carries the proposal's revisions, so the user
sees a converging build, not flailing. On convergence the client fires the presentation: the
sun-access heatmap blooms, the flow runs on the new streets, the camera settles into golden hour.

This is the existing mutation spine scaled up. The `edit_building` route already does server-side
Claude tool-use with a strict schema and Zod validation feeding the same `EditOp` the gizmos
produce. The generative loop keeps that shape (strict tools, the model never computes geometry) and
adds the multi-turn read-score-refine cycle, the richer op union, the prompt cache, and the stream.

---

## 17. Reuse audit for the generative direction

The same audit discipline as section 2. The generative engine is mostly reuse; the new code is two
focused modules and one route.

Reused as-is (the grounded substrate and the spine patterns):

- The baked data in `data/`, the ENU coordinate frame (`src/coords/`), the solar core
  (`src/solar/`), and the build-time payload assembly (`app/page.tsx`, `loadCityModel`). The real
  ground, the real sun, the real streets the grid stitches to. Untouched.
- The immutable-baseline-plus-overlay pattern (`src/mutation/applyEdit.ts`, `editState.ts`,
  ADR-R11). The generated proposal is an overlay over the untouched baseline, the same as a height
  edit.
- The sun-access study (`src/study/*`, ADR-R16) and its worker, as the sun-hours scoring tool.
- The flow re-solve (`src/render/flowEngine.ts`, `src/traffic/*`, ADR-R13) as the traffic scoring
  tool and the live flow on the generated grid.
- `shortestPathTree` (`src/network/shortestPath.ts`) as the reachability substrate.
- The renderer, the BatchedMesh city, and InstancedMesh for copies (ADR-R09, ADR-R15). The
  generated massing renders as InstancedMesh templates; the real city stays a BatchedMesh.
- The server-side Claude tool-use spine (`app/api/edit/route.ts`) as the agent loop's template.

Reused with extension:

- The overlay type (`EditOverlay`) gains a `generatedDistricts` list and the cleared-cluster
  semantics (section 14). Same undo, same baseline immutability.
- The op union. The `EditOp`/`LLMOutput` Zod surface (`src/mutation/editOp.ts`) is the model for
  the generative op union: closed, bounded, reference-based, no geometry. New ops, same discipline.
- `Streets` and the agent graph gain the generated centerlines and stitched edges for render and
  for the simulators.
- The build-time payload (`CityPayload`) gains the anchors the agent references (water edge, park,
  named streets) and the district region handles.

New (the two subsystems plus reachability):

- `src/generate/` the procedural layer: the op types, the deterministic isomorphic expander
  (street grid, block partition, lot subdivision, massing), and the seed/PRNG (sections 12, 13).
- `src/reach/` the isochrone tool over the existing Dijkstra (section 15.1).
- `src/agent/` and `app/api/generate/route.ts` the server-side loop: the tool schemas, the
  read-score-refine cycle, the objective comparator, the prompt cache, the stream (section 16).
- The score tool surface: a thin `src/score/` wrapping the study, flow, reachability, and the new
  pure unit-count function behind clean tool signatures.

---

## 18. How it composes (generative)

```
data/ (baked) + real city overlay (Part I)         [unchanged baseline]
        |
        v
brief --> agent loop (server)  --emit op-->  procedural expander (src/generate, server)
   ^         |                                        |
   |     score vector                            grounded district geometry
   |         |                                        |
   |     scorers (study, flow, reach, units) <--------/
   |         |
   |   refine / converge
   |         |
   \----- accepted ops --stream--> client overlay (generatedDistricts)
                                        |
                                        v
                              client re-expands ops+seed (src/generate, browser)
                                        |
                          +-------------+--------------+
                          v                            v
                  InstancedMesh massing          generated Streets + graph
                  grows incrementally                  |
                          |                            v
                          +----> live render <---- study heatmap, flow on new grid
```

The server side is the loop (agent, expander, scorers, all pure TS in one process). The client
side is the theater (the same expander, the renderer, the live consequence overlays). The overlay
is the shared contract: the agent writes ops to it server-side to score, the client reads ops from
the stream to render, and the same seed guarantees both see the same city.

---

## 19. The generative build sequence (the G-series)

Units 0 to 8 are complete (the lit city, context, time, editor, flow, weather, night, the
sun-access study). The G-series builds the generative engine on that standing base. Smallest
shippable units, each a clean conventional commit, the procedural hands first and fully gated
before any agent. Plan only; do not start until the sequence is approved.

### Unit G0: the generative op surface and the overlay extension

The pure type surface: the generative op union (section 12) as Zod schemas with bounded numerics
and the region/anchor reference grammar, and the overlay extension (`generatedDistricts`, cleared
clusters, section 14). No expansion yet. THREE-free, node-tested: op validation, reference
resolution against fixtures, overlay apply and undo. The analog of the original `EditOp` work.

### Unit G1: the procedural expander, deterministic and headless

The `src/generate/` core: ops plus seed to a grounded district (street grid, stitch to the real
graph, block partition, lot subdivision, templated massing, section 13). THREE-free, node-tested,
deterministic (same seed to the bit). Gated headless, the way the study math was: unit tests on
the invariants (lots inside blocks, no footprint overlaps, heights inside the envelope, the grid
connected to the real graph), plus a `verify:generate` script that dumps a district to GeoJSON for
eyeball inspection. No renderer. This is the hands, proven before anything renders them. Two gates
bind here (ADR-R23): the determinism gate (the expander produces bit-identical geometry from the same
ops and seed in node and in a browser context, a cross-environment test, not node-only) and the
stitching gate (the generated grid joins the real graph as one connected component, checked with the
existing connectivity analysis). They constrain the PRNG and the arithmetic from the first line.

### Unit G2: the first milestone, one directive end to end, live

The exact first milestone. One hard-coded directive, "fill this block with twenty-storey
residential," driven through the G1 expander into the overlay, rendered as InstancedMesh templated
massing growing into the BatchedMesh city, with the sun-access study (ADR-R16) re-running on that
block so the measured consequence updates. No agent. It is first because it proves the whole
pipeline end to end, intent to grounded geometry to live render to measured consequence, before any
agent goes on top. Done when the directive produces grounded massing on the real ground that
appears live and the study heatmap updates on the block, holding the performance budget on both
paths (ADR-R08).

### Unit G3: incremental live assembly and generated streets

Scale G2 from a block to a district and make the assembly cinematic. Generated streets render
through the existing `Streets` path; the district assembles block-by-block with a staggered rise;
and the InstancedMesh growth is proven to hold 60 fps as the district grows to full size with no
full-rebuild stutter (section 20, the headline engineering risk). Still scripted ops, no agent.
This unit exists to nail the live-60 fps claim before the agent drives it.

### Unit G4: the scoring tool surface, including reachability

Expose the simulators as clean scoring tools (`src/score/`): sun-hours on a region (study), unit
and population count (new pure function), reachability isochrone (new `src/reach/`, section 15.1),
and traffic load (flow). Each returns a structured score for a generated district, run both
server-side and client-side. The reachability module and the generated walk graph land here. This
is the substrate the agent reads; no agent yet. The stitching gate (ADR-R23) is a release condition
for this unit: reachability and flow are only trusted once the stitched graph passes the
single-connected-component check, since a disconnected district yields a confidently wrong score.

### Unit G5: the agent loop, server-side, one goal

The server-side Claude tool-use loop (`app/api/generate/route.ts`, `src/agent/`): goal in, the
agent emits generative ops into a server sandbox, the G1 expander builds, the G4 scorers score, the
agent reads deltas and refines, converges, and streams accepted ops to the client, which renders
the build live (section 16). `claude-opus-4-8`, strict Zod tools, structured output, prompt-cached
city context, `ReadableStream`. Start with one objective dimension (a population target) to prove
the read-score-refine cycle and the stream, then widen.

### Unit G6: the full objective vector, refinement, and the demo

Multi-objective convergence (population, park sun-hours, reachability, step-down, car-free), the
live refinement instruction ("denser near the water, keep the park sunny" reshaping the standing
proposal live), and the cinematic presentation (golden-hour assembly, the sun-access bloom, flow on
the new grid, the camera settling). This is the gasp, and the milestone the whole sequence targets.

Later units: architectural variety (unique hero extrusions, more massing templates, richer
programs), multiple simultaneous districts, the reachability overlay as a live ground paint, and a
capture/record mode for the assembly.

---

## 20. Hard parts, flagged once

The four the brief named, plus where the difficulty is most underestimated.

- The generative op vocabulary (section 12). Make-or-break, and the kind of design that churns for
  weeks if the abstraction is wrong. Too low-level drowns the agent, too high-level cannot steer a
  refinement. Mitigation: G0 designs it against the demo sentence as the acceptance test, every
  clause must map to one op or one construction guarantee, and G5 stress-tests it with the real
  agent. Expect to revise it once after G5 shows where the agent reaches for an expression the
  union cannot form.

- Live generation holding 60 fps as the overlay grows, no full-rebuild stutter. The single most
  underestimated engineering risk. The current `City` rebuilds the whole BatchedMesh on any change
  to its building list (a `useMemo` over all buildings), and ADR-R15 already established that a
  BatchedMesh on the WebGPU backend costs one draw per building, with the merge-static rework
  deferred at 1315 buildings. A generated district of one to three thousand buildings makes that
  deferred problem acute and collides with it head-on. The plan's answer is structural, not an
  optimization pass: the generated massing is InstancedMesh templates (section 13), which is one
  draw per template and grows by incrementing the instance count with no geometry reallocation, so
  the district can assemble without a rebuild and without blowing the draw budget. This is why the
  street pattern ships rectilinear first (organic grids need unique footprints and lose the
  instancing). G3 exists to prove this specific claim on device before the agent drives it. If the
  instancing does not hold the budget, the ADR-R15 merge-static rework becomes mandatory here
  rather than deferred.

- The agent's convergence and self-critique against the simulators. The risk is an agent that
  oscillates, never settles, or games one metric (maxes population and tanks the park's sun).
  Mitigation: a bounded objective vector with explicit tolerances, a deterministic "is this better"
  comparator so the loop has a real stopping condition, a max-iteration budget, and the rule that
  the simulators are ground truth while the agent's self-assessment is only the soft tier. The
  agent must report the measured vector every turn, so a regression is visible, not hidden in
  prose.

- Spatial-intent-to-geometry expansion (section 13). The procedural layer can produce geometry that
  is technically valid and reads as a parking lot, not a city: overlapping lots, streets that do
  not connect, massing with no rhythm. The grounding (stitching to real streets, orienting to the
  water, the height gradient) is what makes it read as a place, and that is genuinely hard urban
  design expressed in code. Mitigation: one well-tested template proven by the G1 GeoJSON dump and
  on-device eyes before variety, and variety treated explicitly as a later upgrade.

Where the difficulty is most underestimated, called out because they are easy to wave past, and both
are now first-class build gates (ADR-R23), not just risks, because they fail silently:

- Street-network stitching. Connecting the generated grid to the real Toronto road graph so
  reachability and traffic actually flow through the district is fiddly graph surgery (snapping
  perimeter intersections to real nodes, splitting real edges, keeping the graph a single connected
  component). It is load-bearing for two of the four scoring tools, and it is the thing most likely
  to be hand-waved in planning and painful in build. It lands in G1 and is exercised hard in G4.

- The determinism contract across server-expand and client-expand. If the server scores geometry A
  and the client renders geometry B because a PRNG or a float diverged between node and the browser,
  the measured consequence the user sees will silently not match what the agent converged on, which
  breaks the moat quietly and is hard to detect. The isomorphic expander must be bit-stable across
  node and the browser, which constrains the PRNG and the arithmetic and needs a cross-environment
  test, not just a node test.

- The register under photoreal rendering. The generated district renders through the same pipeline
  as the real city, so it looks exactly as real. That is the spectacle, but it means the
  real-versus-proposal line (ADR-R07) cannot lean on the proposal looking fake. It is held entirely
  by framing and by the measured consequences, which is a UI and product-copy responsibility, not a
  rendering one, and is easy to forget until the proposal is indistinguishable from Toronto and
  nothing says so.

## 21. The multi-city build sequence (the I-series)

The G-series proved the solver on one hand-built neighborhood. The I-series makes the city a slot, not a
constant, so the same engine, expander, scorers, and agent run on any ingested neighborhood. The product
is a search over unsearched design space: the ops are the space, the measured consequences are the
evaluation function, the agent is the optimizer. A solver that only works on Toronto is a demo of a
solver; a solver that works on any neighborhood is the product.

The audit (recorded in ADR-R25) found the Toronto-specific surface separates cleanly: the ENU transform,
the loader mechanism, the expander, the scorers, and the solar engine are general; the time zone and the
manifest values are per-city parameters; and the gates resting on hand-curated ground truth (verify:heights
entirely, the route and alignment half of verify:network, the cordon placement, the count fit) do not
transfer. The trust strategy is the trichotomy: sun reduces to a coordinate-and-geometry-correctness gate
because the physics is universal, connectivity and reachability and traffic gate structurally on any city,
and heights cannot be verified without an oracle so they are labeled, not gated.

Confidence is a first-class per-consequence output (ADR-R26), propagated to the inputs that drove each
consequence, never the city aggregate. Sun carries a shadow ledger: the raymarch attributes each lost
sun-hour to its occluder and carries that occluder's height confidence, so a park shadowed by estimated
towers reads low confidence even on a mostly-measured city. Generated population is high confidence because
it is the proposal's own greenfield geometry (scoped to clear-and-generate, never inherited by a future
retain-existing mode). Reachability and traffic are height-independent and carry structural and coverage
confidence, including the dominant-component scoping when a catchment splits. We build toward open
unattended onboarding (ADR-R27), so the confidence model is the safety layer and is cannot-ship-without.

The units, smallest shippable, each with its gate:

- I0: parameterize the time zone into the manifest (ianaZone). Gate: Toronto unchanged, all green. Done.
- I1: the canonical data/cities/<city>/ layout and extended manifest; move Toronto in as the first
  canonical city. Gate: Toronto loads from the new layout, all tests and gates green.
- I2: extract the automatic structural gate suite (coordinate and geometry equals sun soundness, network
  structural equals reach and traffic soundness) from the Toronto ground-truth gates. Gate: Toronto passes
  the automatic suite with no ground truth consulted.
- I3: the confidence layer, the per-occluder confidence field and shadow attribution in the sun raymarch,
  the reach coverage caveat, the traffic demand caveat, all surfaced to the agent and the UI; population
  scoped to greenfield. Gate: Toronto reads high sun confidence, and a synthetic low-confidence occluder
  injected into a test produces low confidence on the affected region.
- I4: the ingestion pipeline, bbox to OSM roads plus footprints plus tiered heights to a canonical
  snapshot. Gate: produces a valid snapshot for the second city.
- I5: cordon auto-derivation from boundary-crossing edges. Gate: auto-cordon on Toronto reproduces a valid
  structural demand gate.
- I6: NYC clean proof, ingest, render, assemble, all four consequences, structural gates pass, per-city
  signature matches, confidence reads high. Geometry generalizes.
- I7: the binding confidence diagnostic, the same NYC geometry with measured versus forced building:levels
  heights. Gate: confidence flips high to low while the sun value barely moves. The model is proven to key
  on provenance, and this gate binds before the thin-data city.
- I8: the thin-data city (central Mexico City), two phases, one variable at a time: first it gates cleanly
  on geometry, network, and signature; then a park shadowed by guessed towers reads low sun confidence,
  visibly, and shapes the agent's trust.

The milestone is two cities end to end: NYC for the clean geometric proof and the thin-data neighborhood as
the real test of the trust strategy, with the binding diagnostic between them. NYC alone proves the
pipeline generalizes the geometry and nothing about trust, because the trust strategy only does work when
the data is bad, so the thin city is the test, not the victory lap. Then the path to many: open unattended
onboarding, batch ingestion, and a city registry.
