"use client";

import { useState, useEffect, type CSSProperties } from "react";
import type { ClickState, PendingPreview } from "./useEditInteraction";
import { Panel } from "../ui/Panel";
import { c, font, radius, ghostButton, primaryButton } from "../ui/theme";

type Props = {
  clickState: ClickState | null;
  pendingPreview: PendingPreview | null;
  isLoading: boolean;
  error: string | null;
  canUndo: boolean;
  onSubmitText: (text: string) => void;
  onApply: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onClearClick: () => void;
};

function targetLabel(cs: ClickState): string {
  if (cs.kind === "building") return `building ~${Math.round(cs.heightM)} m`;
  return `empty lot  E ${cs.enu[0].toFixed(0)}  N ${cs.enu[1].toFixed(0)}`;
}

function placeholder(cs: ClickState): string {
  return cs.kind === "building"
    ? 'e.g. "make it 30 storeys" or "remove it"'
    : 'e.g. "add a 30-storey residential tower"';
}

export function EditControls({
  clickState,
  pendingPreview,
  isLoading,
  error,
  canUndo,
  onSubmitText,
  onApply,
  onCancel,
  onUndo,
  onClearClick,
}: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!pendingPreview) setText("");
  }, [pendingPreview]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSubmitText(trimmed);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onClearClick();
  };

  const showInput = !!clickState && !pendingPreview;
  const showHint = !clickState && !canUndo;

  const undoAccessory = canUndo ? (
    <button onClick={onUndo} style={styles.undo}>
      &#8617; undo
    </button>
  ) : undefined;

  return (
    <Panel eyebrow="reshape" accessory={undoAccessory} style={{ top: 86, left: 20, width: 300 }} delay={60}>
      {showHint && <div style={styles.hint}>Click a building or empty ground, then describe the change.</div>}

      {showInput && (
        <>
          <div style={styles.targetRow}>
            <span style={styles.target}>{targetLabel(clickState)}</span>
            <button onClick={onClearClick} style={styles.clear} title="Clear" aria-label="Clear selection">
              &times;
            </button>
          </div>
          <div style={styles.inputRow}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder={placeholder(clickState)}
              disabled={isLoading}
              autoFocus
              style={styles.input}
            />
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || isLoading}
              style={{ ...primaryButton, ...(!text.trim() || isLoading ? styles.disabled : {}) }}
            >
              {isLoading ? "..." : "Ask"}
            </button>
          </div>
          {error && <div style={styles.error}>{error}</div>}
        </>
      )}

      {pendingPreview && (
        <>
          <div style={styles.diff}>{pendingPreview.diffLine}</div>
          <div style={styles.actionRow}>
            <button onClick={onApply} style={{ ...primaryButton, flex: 1 }}>
              Apply
            </button>
            <button onClick={onCancel} style={{ ...ghostButton, flex: 1 }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

const styles: Record<string, CSSProperties> = {
  undo: { ...ghostButton, padding: "2px 8px", fontSize: 10.5 },
  hint: { fontFamily: font.sans, fontSize: 11.5, color: c.ink3, lineHeight: 1.5 },
  targetRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  target: { fontFamily: font.mono, fontSize: 11.5, color: c.accent, letterSpacing: "0.01em" },
  clear: { background: "transparent", border: "none", color: c.ink3, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" },
  inputRow: { display: "flex", gap: 6 },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.sans,
    fontSize: 12,
    color: c.ink,
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${c.hairline2}`,
    borderRadius: radius.sm,
    padding: "6px 9px",
    outline: "none",
  },
  disabled: { opacity: 0.4, cursor: "default" },
  error: { fontFamily: font.sans, fontSize: 11, color: c.bad, lineHeight: 1.4, marginTop: 7 },
  diff: { fontFamily: font.mono, fontSize: 12, color: c.accent, padding: "1px 0 2px", lineHeight: 1.4 },
  actionRow: { display: "flex", gap: 8, marginTop: 9 },
};
