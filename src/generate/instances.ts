import type { MassingPlacement } from "./massing";

// Convert grounded massing (footprint polygons plus heights) into oriented-box instances for the
// renderer (ADR-R18, the InstancedMesh template). Because lots are rectangles, an oriented box covers
// each footprint exactly, so one instanced draw per template renders the whole district and growing it
// is growing the instance count, no rebuild. The box is derived from the footprint itself: the first
// edge gives the width and the Y rotation, the second edge gives the depth, the corners give the
// centroid. Render-side only (the atan2 here is for display orientation, not the scored geometry, which
// is the footprint), so it is outside the determinism gate. Pure.

export type BoxInstance = {
  cx: number; // ENU east centroid
  cn: number; // ENU north centroid
  width: number; // extent along the first footprint edge
  depth: number; // extent along the second footprint edge
  height: number; // metres
  rotation: number; // Y rotation, radians: atan2 of the first edge in ENU
};

// One box from a footprint ring (4 corners, an oriented rectangle) and a height.
export function footprintBox(footprint: [number, number][], height: number): BoxInstance {
  let cx = 0;
  let cn = 0;
  for (const [e, n] of footprint) {
    cx += e;
    cn += n;
  }
  cx /= footprint.length;
  cn /= footprint.length;

  const de0 = footprint[1][0] - footprint[0][0];
  const dn0 = footprint[1][1] - footprint[0][1];
  const de1 = footprint[2][0] - footprint[1][0];
  const dn1 = footprint[2][1] - footprint[1][1];

  return {
    cx,
    cn,
    width: Math.hypot(de0, dn0),
    depth: Math.hypot(de1, dn1),
    height,
    rotation: Math.atan2(dn0, de0),
  };
}

// Split massing into the main bodies (box or tower) and the wider podium bases, each an instance set
// the renderer draws as one InstancedMesh.
export function massingInstances(massing: MassingPlacement[]): {
  boxes: BoxInstance[];
  podiums: BoxInstance[];
} {
  const boxes: BoxInstance[] = [];
  const podiums: BoxInstance[] = [];
  for (const m of massing) {
    boxes.push(footprintBox(m.footprint, m.height));
    if (m.podium) podiums.push(footprintBox(m.podium.footprint, m.podium.height));
  }
  return { boxes, podiums };
}
