"use client";

import { useEditHud } from "./editHud";

// Minimal readout for the selected building: its current storey count, updated
// live while the gizmo is dragged. Hidden when nothing is selected.
export function SelectionPanel() {
  const storeys = useEditHud();
  if (storeys === null) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "8px 16px",
        borderRadius: 999,
        background: "rgba(18, 16, 14, 0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        color: "#f2e9dc",
        font: "13px ui-monospace, SFMono-Regular, monospace",
        letterSpacing: "0.02em",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span style={{ fontWeight: 600 }}>{storeys} storeys</span>
      <span style={{ opacity: 0.55 }}>drag the handle to reshape · ⌘Z undo</span>
    </div>
  );
}
