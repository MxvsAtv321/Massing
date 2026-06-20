import * as THREE from "three";

// Desire-line geometry: straight-intent arcs between gateways, raised above the ground
// and offset to the right of travel so opposing flows separate. Deliberately NOT routed
// onto streets; demand is intent, not flow (flow arrives in Part 3 and looks different).
//
// Axis mapping matches buildings.ts / roadGeometry.ts:
//   ENU east -> Three +X, ENU north -> Three -Z, up -> +Y.

const GROUND_Y = 0.2; // endpoints just above the ground and road ribbons
const RIGHT_OFFSET_M = 9; // lateral separation of opposing directions (right-hand)
const ARC_LIFT_FRACTION = 0.18; // apex height as a fraction of the span

export function enuToThree(e: number, n: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(e, y, -n);
}

// Tube radius grows with demand but stays legible across the full range (sqrt scaling).
export function tubeRadiusForTrips(tripsPerHour: number): number {
  const r = 1.2 + Math.sqrt(Math.max(0, tripsPerHour)) * 0.07;
  return Math.min(6, r);
}

// A lifted, right-offset quadratic arc from origin to destination (ENU in).
export function desireArc(
  fromEnu: [number, number],
  toEnu: [number, number]
): THREE.QuadraticBezierCurve3 {
  const [e0, n0] = fromEnu;
  const [e1, n1] = toEnu;
  let dx = e1 - e0;
  let dy = n1 - n0;
  const span = Math.hypot(dx, dy) || 1;
  dx /= span;
  dy /= span;
  // Right perpendicular of the ENU travel direction (rotate -90 degrees): (dy, -dx).
  const rx = dy;
  const ry = -dx;
  const o0e = e0 + rx * RIGHT_OFFSET_M;
  const o0n = n0 + ry * RIGHT_OFFSET_M;
  const o1e = e1 + rx * RIGHT_OFFSET_M;
  const o1n = n1 + ry * RIGHT_OFFSET_M;

  const p0 = enuToThree(o0e, o0n, GROUND_Y);
  const p1 = enuToThree(o1e, o1n, GROUND_Y);
  const ctrl = enuToThree((o0e + o1e) / 2, (o0n + o1n) / 2, GROUND_Y + span * ARC_LIFT_FRACTION);

  return new THREE.QuadraticBezierCurve3(p0, ctrl, p1);
}

export function gatewayMarkerPos(enu: [number, number]): THREE.Vector3 {
  return enuToThree(enu[0], enu[1], GROUND_Y + 1.5);
}
