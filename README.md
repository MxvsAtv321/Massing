# Massing

Type a plain-English change to a Toronto neighborhood. Watch what it does to sunlight on a real park. See honest uncertainty, not a confident lie.

Built for the Velocity Future Cities Innovation Challenge.

---

## The five-second moment

A user types "add a 30-storey tower here." They see the shadow sweep across St. James Park in real time, a confidence band on the shadow extent, and an explicit list of what the tool refuses to model. That moment is the entire product. Everything else is scope cut.

## What it does

- Renders real City of Toronto 3D massing data for the St. Lawrence / St. James Park area
- Computes sun position with atmospheric refraction via `astronomy-engine` for any time in Toronto local time
- Casts geometric shadow polygons as the measurement source of truth (PCF shadows for the interactive sweep, polygons for every printed number)
- Lets a user click a location and type a change; the LLM emits a structured `EditOp`, never computes geometry
- Shows per-building data-quality badges: measured, estimated, or hypothetical
- Attaches a confidence band to every shadow readout, propagated from real height uncertainty
- Names what it will not model: traffic change, displacement, property values, human movement, ground slope
- Bakes provenance into the exported image so the footer survives a screenshot pasted into a council slide

## What it does not do

Ground slope and terrain, footprint and position error, behavioral predictions of any kind. These are not gaps; they are in the do-NOT-measure list by design.

## Stack

- Next.js 15 App Router, TypeScript, Vercel, pnpm
- React Three Fiber / Three.js for 3D
- `astronomy-engine` as the single solar engine (refraction on, validated against NREL SPA)
- Local ENU tangent plane anchored at the neighborhood centroid, metric units throughout

## Data

`data/stlawrence.geojson` is a baked snapshot of City of Toronto 3D Massing data, clipped to the St. Lawrence neighborhood, reprojected to local ENU. Heights are the `AVG_HEIGHT` field (height above grade, metres), measured by LiDAR. The snapshot is the single source; nothing is fetched at build or runtime.

Provenance: City of Toronto 3D Massing 2025, dated 2025-12-05.

## Commands

```
pnpm dev            run the app
pnpm build          production build
pnpm lint           lint
pnpm typecheck      type check
pnpm test           unit tests
pnpm verify:heights height-verification gate against the real snapshot
```

## Design decisions

See `docs/decisions.md` for the five settled ADRs and `docs/architecture.md` for the full design rationale.

Key decisions: one neighborhood only (ADR-001), flat ground plane disclosed (ADR-002), `astronomy-engine` everywhere with SPA as oracle only (ADR-003), click for location plus natural language for parameters (ADR-004), shadow-only first (ADR-005).
