# Massing, Architecture Reference (rebuild)

Status: target architecture for the ground-up rebuild into a cinematic, real-time,
interactive city builder and simulator on real Toronto data. This document is the shared
state. It supersedes the prior shadow-honesty architecture in full. Settled decisions live
in `docs/decisions.md` as ADRs; this document is the design and the reasoning.

Read sections 1 (identity), 3 (rendering), and 4 (simulation) first. They are the spine.
Section 8 is the rebuild sequence. Section 9 is the design work to commission.

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
