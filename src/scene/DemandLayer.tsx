"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";
import { desireArc, tubeRadiusForTrips, gatewayMarkerPos } from "./demandGeometry";
import type { Place, ODFlow } from "../traffic/demand";

const LINE_COLOR = "#7ec8e3"; // cool cyan, contrasts the warm-grey roads
const MARKER_IDLE = "#5b8aa6";
const MARKER_PENDING = "#f5b942"; // the app's active accent

// One directed desire line: a translucent cyan arc with an arrowhead at the destination.
function DesireLine({ from, to, trips }: { from: Place; to: Place; trips: number }) {
  const { tube, headPos, headQuat, radius } = useMemo(() => {
    const curve = desireArc(from.centroidEnu, to.centroidEnu);
    const radius = tubeRadiusForTrips(trips);
    const tube = new THREE.TubeGeometry(curve, 28, radius, 8, false);
    const headPos = curve.getPoint(1);
    const tan = curve.getTangent(1).normalize();
    const headQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tan
    );
    return { tube, headPos, headQuat, radius };
  }, [from, to, trips]);

  useEffect(() => () => tube.dispose(), [tube]);

  return (
    <>
      <mesh geometry={tube}>
        <meshStandardMaterial
          color={LINE_COLOR}
          transparent
          opacity={0.55}
          emissive={LINE_COLOR}
          emissiveIntensity={0.25}
          roughness={0.6}
          metalness={0}
        />
      </mesh>
      <mesh position={headPos} quaternion={headQuat}>
        <coneGeometry args={[radius * 1.9, radius * 4.5, 12]} />
        <meshStandardMaterial
          color={LINE_COLOR}
          transparent
          opacity={0.75}
          emissive={LINE_COLOR}
          emissiveIntensity={0.3}
        />
      </mesh>
    </>
  );
}

export function DemandLayer({
  places,
  flows,
  visible,
  pendingOrigin,
  pendingDestination,
  onGatewayClick,
}: {
  places: Place[];
  flows: ODFlow[];
  visible: boolean;
  pendingOrigin: string | null;
  pendingDestination: string | null;
  onGatewayClick: (id: string) => void;
}) {
  const placeById = useMemo(() => {
    const m = new Map<string, Place>();
    for (const p of places) m.set(p.id, p);
    return m;
  }, [places]);

  if (!visible) return null;

  return (
    <>
      {places.map((p) => {
        const pending = p.id === pendingOrigin || p.id === pendingDestination;
        return (
          <mesh
            key={p.id}
            position={gatewayMarkerPos(p.centroidEnu)}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onGatewayClick(p.id);
            }}
          >
            <cylinderGeometry args={[7, 7, 4, 18]} />
            <meshStandardMaterial
              color={pending ? MARKER_PENDING : MARKER_IDLE}
              emissive={pending ? MARKER_PENDING : MARKER_IDLE}
              emissiveIntensity={pending ? 0.5 : 0.2}
              roughness={0.5}
              metalness={0}
            />
          </mesh>
        );
      })}

      {flows.map((f) => {
        const from = placeById.get(f.fromPlaceId);
        const to = placeById.get(f.toPlaceId);
        if (!from || !to || f.tripsPerHour <= 0) return null;
        return <DesireLine key={f.id} from={from} to={to} trips={f.tripsPerHour} />;
      })}
    </>
  );
}
