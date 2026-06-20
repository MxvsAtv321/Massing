"use client";

import { useState } from "react";
import { Html } from "@react-three/drei";
import { type ThreeEvent } from "@react-three/fiber";
import { enuToThree } from "./demandGeometry";
import type { CountStation, StationFit } from "../traffic/validation";

const NEUTRAL = "#9fb3c8"; // a measured data point, before any comparison
function gehColor(geh: number): string {
  return geh < 5 ? "#45a05f" : geh < 10 ? "#d9a640" : "#d44f29";
}

// Factual markers at real count stations. When a flow exists, each marker is colored by
// GEH agreement (green good, amber acceptable, red poor), so the screen shows where the
// simulation matches measured reality and where it does not. Hover for the numbers.
export function CountLayer({
  stations,
  fitById,
  visible,
}: {
  stations: CountStation[];
  fitById: Map<string, StationFit> | null;
  visible: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);

  if (!visible) return null;

  return (
    <>
      {stations.map((s) => {
        const fit = fitById?.get(s.id) ?? null;
        const color = fit ? gehColor(fit.geh) : NEUTRAL;
        return (
          <mesh
            key={s.id}
            position={enuToThree(s.enu[0], s.enu[1], 4)}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              setHover(s.id);
            }}
            onPointerOut={() => setHover((h) => (h === s.id ? null : h))}
          >
            <sphereGeometry args={[4, 12, 12]} />
            <meshBasicMaterial color={color} />
            {hover === s.id && (
              <Html style={{ pointerEvents: "none" }} distanceFactor={400}>
                <div style={tooltip}>
                  <div style={tipName}>{s.name}</div>
                  <div style={tipRow}>measured {s.measuredVol}/hr ({s.countDate || "n/a"})</div>
                  {fit && (
                    <div style={tipRow}>
                      simulated {Math.round(fit.simulated)}/hr &middot; GEH {fit.geh.toFixed(1)}
                    </div>
                  )}
                </div>
              </Html>
            )}
          </mesh>
        );
      })}
    </>
  );
}

const tooltip: React.CSSProperties = {
  background: "rgba(10,10,12,0.92)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 6,
  padding: "5px 8px",
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  color: "#e8e0d0",
  whiteSpace: "nowrap",
  transform: "translate(-50%, -130%)",
};
const tipName: React.CSSProperties = { fontWeight: 600, marginBottom: 2 };
const tipRow: React.CSSProperties = { color: "#b8b0a4" };
