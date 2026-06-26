"use client";

import { useAgentState } from "./agentStore";

// The agent run's DOM readout (G5): the target, the live status as it builds, and, when it finishes,
// the population outcome and the signature check, the gate that says the city the client rendered is
// the one the agent scored. Match is green, mismatch is red and loud, because a silent mismatch is the
// moat failing.
export function AgentPanel() {
  const a = useAgentState();
  if (!a.running && a.populationTarget === null) return null;

  const sigColor =
    a.signature === "match" ? "#7fd1a0" : a.signature === "mismatch" ? "#e06b6b" : "#9aa3ad";

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        top: 60,
        width: 300,
        padding: "12px 14px",
        borderRadius: 8,
        background: "rgba(12,14,18,0.82)",
        color: "#cdd3da",
        font: "12px ui-monospace, SFMono-Regular, monospace",
        letterSpacing: "0.02em",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div style={{ fontWeight: 600, color: "#e8edf2", marginBottom: 6 }}>GENERATIVE AGENT</div>
      {a.populationTarget !== null && (
        <div>target {a.populationTarget.toLocaleString()} residents</div>
      )}
      <div style={{ marginTop: 4, color: "#aeb6bf" }}>
        {a.running ? `working: ${a.status}` : `${a.converged ? "converged" : "stopped"} (${a.reason})`}
      </div>
      {!a.running && a.signature && a.signature !== "unknown" && (
        <div style={{ marginTop: 8, color: sigColor, fontWeight: 600 }}>
          signature {a.signature === "match" ? "MATCH: client = server" : "MISMATCH"}
        </div>
      )}
    </div>
  );
}
