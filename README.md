# Massing

A cinematic, real-time city builder and simulator on real Toronto data. Fly through a gorgeously lit 3D slice of the St. Lawrence / St. James Park neighborhood, reshape it with the feel of a professional 3D editor, and watch the city respond.

The bar: make a graphics or simulation engineer lean in and ask "this runs in a browser?".

## Status

Ground-up rebuild in progress. The repo began as a shadow-honesty decision tool and is being rebuilt into the cinematic simulator described here. The target architecture and the decision log are in `docs/architecture.md` and `docs/decisions.md`. The rebuild proceeds in numbered units; the renderer spine (a WebGPU canvas with an automatic WebGL2 fallback) is standing.

## What it is

- A real slice of Toronto, every building extruded from its own measured City of Toronto height, in true local metres.
- A WebGPU rendering pipeline: physically based materials, image-based lighting, cascaded sun shadows, and a node-based post stack (GTAO, bloom, fog, AgX tone mapping), tuned for a cinematic look in real time.
- A live simulation: time of day driven by real solar position, traffic flow on the real street network, and growth, all reacting when you reshape the city.
- A professional editor feel: orbit and fly cameras, in-world selection, transform gizmos, and natural-language edits that resolve to the same bounded operations.

## The one line

Spectacle and feel are primary; accuracy is secondary. The one line never crossed is dressing invented simulation as measured authority. Grounded values (real building heights, real road geometry) read as real; simulated values (flow, growth, weather, agents) read as part of the simulated world.

## Stack

- Next.js 15 App Router, TypeScript, Vercel, pnpm.
- React Three Fiber on the Three.js WebGPU entry, TSL for materials, post, and compute, with an automatic WebGL2 fallback.
- Local ENU tangent plane anchored at the neighborhood centroid, metric throughout; never Web Mercator for geometry.
- astronomy-engine for sun position (refraction on).

## Data

`data/stlawrence.geojson` is a baked snapshot of City of Toronto 3D Massing data, clipped to the St. Lawrence neighborhood (1315 building polygons). Heights are the `AVG_HEIGHT` field (metres above grade). `data/network.json` is the OpenStreetMap drivable road network for the catchment. The snapshot is the single source; nothing is fetched at build or runtime.

Attribution: City of Toronto 3D Massing 2025; road network OpenStreetMap contributors (ODbL).

## Commands

```
pnpm dev         run the app
pnpm build       production build
pnpm lint        lint
pnpm typecheck   type check
pnpm test        unit tests
```

## Design decisions

See `docs/decisions.md` for the rebuild ADRs (R-series) and the disposition of the originals, and `docs/architecture.md` for the full design.
