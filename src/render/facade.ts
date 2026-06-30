import { positionWorld, normalLocal, smoothstep, select, abs, mix, float, attribute } from "three/tsl";
import { WINDOW_DEFAULTS } from "./windowLights";

// The daytime facade (VD1): the same window grid the night lights use, expressed in albedo and roughness so
// every building reads as a glazed or masonry facade in daylight, not a flat box. Window panes are recessed
// (darker) and glassier; the mullions and spandrels between them keep the building's archetype colour. This
// is the scalable answer to "detail every building", procedural material on the real massing, all buildings,
// any city, within the appearance-not-identity rule: no geometry, no draw call, the scorers never see it.
// Base albedo and roughness arrive as per-vertex attributes baked in City (aColor, aRoughness), so the grid
// modulates the V2/V3 material rather than replacing it; on roofs the wall mask is zero, so they stay matte.

const PANE_SOFT = 0.06; // soft edge on the pane bands, in cell units (mirrors the night node)
const PANE_DARKEN = 0.5; // recessed glass panes read this fraction of the spandrel albedo
const PANE_ROUGHNESS = 0.08; // panes are far glassier than the mullions, so they catch the sky

export function buildFacadeColorRoughness(metresPerStorey: number) {
  const d = WINDOW_DEFAULTS;
  const floorPitch = metresPerStorey || d.floorPitch;
  const pos = positionWorld;
  const nrm = normalLocal;

  // Wall faces only; roofs and the base cap keep their plain archetype material.
  const wall = smoothstep(0.5, 0.2, abs(nrm.y));
  const horiz = select(abs(nrm.x).greaterThan(abs(nrm.z)), pos.z, pos.x);
  const localV = pos.y.div(floorPitch).fract();
  const localH = horiz.div(d.bayPitch).fract();

  const bandV = smoothstep(d.paneInsetV[0], d.paneInsetV[0] + PANE_SOFT, localV).mul(
    smoothstep(d.paneInsetV[1], d.paneInsetV[1] - PANE_SOFT, localV)
  );
  const bandH = smoothstep(d.paneInsetH[0], d.paneInsetH[0] + PANE_SOFT, localH).mul(
    smoothstep(d.paneInsetH[1], d.paneInsetH[1] - PANE_SOFT, localH)
  );
  const paneness = bandV.mul(bandH).mul(wall); // 1 inside a window pane on a wall, 0 on mullions and roofs

  // attribute() returns a bare Node; cast to the fluent node types (a vec3 like positionWorld, a scalar like
  // localV) so the TSL math chains typecheck. Runtime is unchanged: these are valid per-vertex attribute
  // nodes, the same kind City bakes for aRoughness/aMetalness.
  const albedo = attribute("aColor", "vec3") as unknown as typeof positionWorld;
  const colorNode = mix(albedo, albedo.mul(PANE_DARKEN), paneness);
  const baseRough = attribute("aRoughness", "float") as unknown as typeof localV;
  const roughnessNode = mix(baseRough, float(PANE_ROUGHNESS), paneness);

  return { colorNode, roughnessNode };
}
