import {
  Fn,
  If,
  positionWorld,
  positionView,
  normalLocal,
  normalView,
  faceDirection,
  smoothstep,
  select,
  abs,
  mix,
  float,
  vec2,
  vec3,
  attribute,
} from "three/tsl";
import { WINDOW_DEFAULTS } from "./windowLights";

// The procedural facade, the scalable answer to "detail every building": material on the real massing, all
// buildings, any city, within the appearance-not-identity rule (no geometry, no draw call, the scorers never
// see it). The same window grid the night lights use is expressed three ways:
//   VD1 albedo + roughness: recessed darker glass panes, lighter mullions and spandrels between them.
//   VD2 relief: the grid as a height field perturbs the surface normal (Mikkelsen screen-space bump), so
//        the mullions catch the sun and the panes fall into shade, the depth cue without any geometry. It
//        fades out with distance so the high-frequency grid never shimmers far off, a free material LOD.
// Base albedo and roughness arrive as per-vertex attributes baked in City (aColor, aRoughness); on roofs the
// wall mask is zero, so they stay matte and flat.

const PANE_SOFT = 0.06; // soft edge on the pane bands, in cell units (mirrors the night node)
const PANE_DARKEN = 0.5; // recessed glass panes read this fraction of the spandrel albedo
const PANE_ROUGHNESS = 0.08; // panes are far glassier than the mullions, so they catch the sky
const RELIEF_SCALE = 0.06; // depth-cue strength of the mullion relief (tune on device)
const RELIEF_NEAR = 90; // metres: full relief nearer than this
const RELIEF_FAR = 360; // metres: relief faded out beyond this, so the grid never shimmers at distance

export function buildFacadeNodes(metresPerStorey: number) {
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
  // localV) so the TSL math chains typecheck. Runtime is unchanged: valid per-vertex attribute nodes.
  const albedo = attribute("aColor", "vec3") as unknown as typeof positionWorld;
  const colorNode = mix(albedo, albedo.mul(PANE_DARKEN), paneness);
  const baseRough = attribute("aRoughness", "float") as unknown as typeof localV;
  const roughnessNode = mix(baseRough, float(PANE_ROUGHNESS), paneness);

  // Relief: the grid as a height field (mullions proud at 1, panes recessed at 0), perturbing the normal by
  // the Mikkelsen surface-gradient method using the screen-space derivative of the height directly (the
  // height is procedural, not a sampled texture). The derivatives must sit in uniform control flow, so they
  // are taken and stored first; the expensive surface-gradient assembly is then gated behind the near
  // distance, so the far carpet of background buildings pays nothing. The strength has already faded to zero
  // by RELIEF_FAR, so the cutoff is seamless. This is the VD2 relief plus its perf gate.
  const dist = positionView.length();
  const reliefStrength = smoothstep(RELIEF_FAR, RELIEF_NEAR, dist).mul(RELIEF_SCALE);
  const surfNorm = normalView;

  const normalNode = Fn(() => {
    // Height field broadcast to a vec3 so the screen-space derivative (typed for vectors only) applies.
    const height = vec3(paneness.oneMinus());
    const dHdxy = vec2(height.dFdx().x, height.dFdy().x).mul(reliefStrength).toVar();
    const vSigmaX = positionView.dFdx().normalize().toVar();
    const vSigmaY = positionView.dFdy().normalize().toVar();
    const n = vec3(surfNorm).toVar();
    If(dist.lessThan(RELIEF_FAR), () => {
      const R1 = vSigmaY.cross(surfNorm);
      const R2 = surfNorm.cross(vSigmaX);
      const fDet = vSigmaX.dot(R1).mul(faceDirection as unknown as typeof dist);
      const vGrad = fDet.sign().mul(dHdxy.x.mul(R1).add(dHdxy.y.mul(R2)));
      n.assign(fDet.abs().mul(surfNorm).sub(vGrad).normalize());
    });
    return n;
  })();

  return { colorNode, roughnessNode, normalNode };
}
