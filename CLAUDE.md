# CLAUDE.md

Operational context for Claude Code on this repo. Read this, then `docs/architecture.md` (design) and `docs/decisions.md` (settled decisions), before acting.

## What this is

Massing is a cinematic, real-time, interactive city builder and simulator on real Toronto data. You fly through a gorgeously lit 3D slice of the St. Lawrence / St. James Park neighborhood, reshape it with the feel of a professional 3D editor, and watch the city respond. The bar is that a graphics or simulation engineer leans in and asks "this runs in a browser?".

Two mandates, in order: functionality first (a living, manipulable city; latency is the enemy), front end a close second (a look with no business running in a browser). Spectacle and feel are primary; accuracy is explicitly secondary.

This is a ground-up rebuild. The repo was a shadow-honesty decision tool; that product and its honesty apparatus are gone (ADR-R07). The rebuild keeps the real data and the correct math and builds a new rendering, simulation, and interaction stack on top.

## The one line you never cross

Do not dress invented simulation in the costume of measured authority. A value is either honestly grounded (the real Toronto height a building was extruded from, the real road geometry) or it is clearly part of the simulated world (flow, growth, weather, agents). The line is held by register, by how things look and read, not by a badge subsystem. There are no confidence badges, no bands, no do-not-measure list, no provenance-as-contract. Inside that line, invent freely and go maximal.

## Non-negotiables (the spine, do not violate)

Grounded assets are sacred:

- Real City of Toronto measured heights, never guessed. Heights come from the baked snapshot in `data/`, not invented. A feature missing a height is excluded, never defaulted.
- Coordinates are true local metres. The snapshot is EPSG:3857. Reproject through geodetic lon/lat to local ENU. Never recenter in 3857 metres: Web Mercator inflates horizontal distance about 1.38x at Toronto's latitude, which would distort the whole city by 38 percent.
- Footprint fragmentation is real. A tall building is often split into podium and shaft polygons. Keep every polygon and extrude each at its own AVG_HEIGHT. Cluster polygons into buildings for identity and selection; never collapse a cluster to one footprint at the max height.
- One solar engine, astronomy-engine, refraction on (ADR-003, carried). All time math pinned to the `America/Toronto` IANA zone via zoned instants, never a naive `Date` and never the client locale.
- Data is baked. The snapshot in `data/` is the single source; never fetch anything at build or runtime.

Rendering and simulation spine:

- WebGPU + TSL is the pipeline (ADR-R01). One `WebGPURenderer`, TSL authored once and compiled to both backends, the node post pipeline on both (never the legacy WebGL `EffectComposer`). The WebGL2 fallback is the same node pipeline minus its compute-dependent passes, visibly lesser by decision, not a second post stack.
- The static city is one `BatchedMesh`, not InstancedMesh (the geometries are unique, not copies) and not merged geometry (per-object selection and culling must survive). ADR-R09.
- Simulation runs on a fixed timestep, 60 Hz, decoupled from render and interpolated (ADR-R05). Large populations are structure-of-arrays in GPU-resident buffers (ADR-R06).
- Performance is a first-class gate (ADR-R08). A milestone is not done until it holds the budget on both paths: 60 fps on the WebGPU reference device, a 30 fps floor on the WebGL2 fallback device. Measured with stats-gl and `renderer.info`.

## Stack (locked)

- Next.js 15 App Router, TypeScript, deploy on Vercel, pnpm. Next is kept for continuity, not fit (ADR-R02); the canvas is a pure client island, dynamic import with `ssr: false`.
- React Three Fiber on the Three.js WebGPU entry (`three/webgpu`, `three/tsl`). drei for camera, controls, helpers.
- Local ENU tangent plane anchored at the neighborhood centroid, metric. Not Web Mercator.
- astronomy-engine as the single runtime solar engine, refraction on.
- LLM mutation: closed `EditOp` union, bounded numerics, existing-entity-ID references, structured output, preview then apply. Direct manipulation (gizmos) is the primary edit path; natural language is the secondary path that resolves to the same EditOps. The model never computes geometry (ADR-004, amended).

## Settled decisions (see docs/decisions.md)

Rebuild R-series:

- ADR-R01: WebGPU + TSL now; the risk is the post stack; the WebGL2 fallback is visibly lesser.
- ADR-R02: stay on Next for continuity, with a recorded revisit trigger.
- ADR-R03: greenfield rebuild in place, porting the kept layers.
- ADR-R04: AgX tone mapping. ADR-R05: fixed 60 Hz simulation. ADR-R06: SoA GPU-resident buffers.
- ADR-R07: honesty apparatus removed; the one line is held by register.
- ADR-R08: performance budget is a first-class gate. ADR-R09: the static city is one BatchedMesh.

Originals ADR-001 to ADR-010 are carried, amended, or superseded under the rebuild; dispositions in docs/decisions.md.

## Data

- The snapshot is committed in `data/` and is the single source. Do not fetch anything from the network at build or runtime.
  - `data/stlawrence.geojson`: EPSG:3857 FeatureCollection of building massing polygons (1315 of them).
  - `data/sources.json`: the source manifest. Used now as a dataset attribution credit line, not an honesty contract.
  - `data/network.json`: the OSM drivable road graph for the catchment, reprojected at load through the city's shared ENU origin so roads and buildings co-register.
  - `data/known-heights.json`, `data/known-routes.json`, `data/cordon.json`, `data/traffic-counts.json`: ground-truth and traffic inputs, now consumed by the dev sanity scripts, not as build gates.
- Height field is `AVG_HEIGHT` (height above grade, metres). Extrude from a flat plane (ADR-002, carried); no datum arithmetic.
- Exclude the known processing artifact: features with `SURF_ELEV` equal to 130.07 m.
- A real building may be several polygons; the grouping subsystem (`src/model/grouping.ts`) handles identity. Geometry is per polygon.
- Attribution: "City of Toronto 3D Massing 2025", and OpenStreetMap contributors (ODbL) for the road network.

## Repo layout

```
app/                 Next.js App Router shell; api/edit is the LLM mutation route
app/_components/      client-island wrappers (CanvasClient)
src/render/          WebGPU renderer, R3F viewport, backend selection
src/coords/          Web Mercator inverse, ENU transform (kept)
src/solar/           sun vector, Toronto-zoned time (kept)
src/model/           domain types, city model loader, footprint grouping (kept)
src/network/         OSM drivable graph parser, ENU-aligned (kept)
src/mutation/        EditOp union, parse, apply (kept, to be reworked for gizmos)
src/traffic/         BPR flow assignment (kept as the flow-field solver)
data/                baked snapshot and inputs
scripts/             dev data sanity checks (verify:*), no longer build gates
docs/                architecture.md, decisions.md
```

Demolished in the rebuild: `src/honesty/`, `src/scene/`, `src/ui/`. The new rendering, simulation, and interaction layers are greenfield (ADR-R03).

## Commands

- `pnpm dev` run the app
- `pnpm build` production build
- `pnpm lint` lint
- `pnpm typecheck` types
- `pnpm test` unit tests
- `pnpm verify:*` developer data sanity checks against the snapshot (heights, solar, network, demand, flow, counts)

## Workflow contract

- Plan mode first. Propose the file list, module boundaries, type definitions, and test list. Stop and wait for approval before writing code.
- Build the smallest shippable unit, then iterate. One logical unit per commit.
- After each commit, stop and report: the file tree added, the commit message, and the test output. Do not start the next unit until told.
- A milestone is not done until it holds the performance budget on both render paths (ADR-R08).
- Flag confidently-wrong risks loudly. Ask one sharp question when uncertain rather than guessing.

## Commit and voice conventions

- Conventional commits. Subject under 72 characters, imperative mood.
- One logical unit per commit.
- Never include "Co-authored-by". Never reference Claude or AI in commit messages.
- Voice for any prose the agent writes (docs, comments, PR text): direct, no em dashes, no corporate sheen.
