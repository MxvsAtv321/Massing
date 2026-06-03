"use client";

import { useState, useEffect } from "react";
import type { ClickState, PendingPreview } from "./useEditInteraction";

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
  if (cs.kind === "building") {
    return `Building ~${Math.round(cs.heightM)} m`;
  }
  return `Empty lot (E ${cs.enu[0].toFixed(0)} m, N ${cs.enu[1].toFixed(0)} m)`;
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

  // Clear input when preview is dismissed (apply or cancel).
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

  return (
    <div style={styles.panel}>
      {/* Undo */}
      {canUndo && (
        <button onClick={onUndo} style={styles.undoBtn}>
          ↩ Undo
        </button>
      )}

      {/* Idle hint */}
      {showHint && (
        <div style={styles.hint}>
          Click a building or empty ground to edit
        </div>
      )}

      {/* Target + input */}
      {showInput && (
        <>
          <div style={styles.targetRow}>
            <span style={styles.targetLabel}>{targetLabel(clickState)}</span>
            <button onClick={onClearClick} style={styles.clearBtn} title="Clear">
              ✕
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
              style={{
                ...styles.askBtn,
                ...((!text.trim() || isLoading) ? styles.askBtnDisabled : {}),
              }}
            >
              {isLoading ? "…" : "Ask"}
            </button>
          </div>
          {error && <div style={styles.error}>{error}</div>}
        </>
      )}

      {/* Preview */}
      {pendingPreview && (
        <>
          <div style={styles.diffLine}>{pendingPreview.diffLine}</div>
          <div style={styles.actionRow}>
            <button onClick={onApply} style={styles.applyBtn}>
              Apply
            </button>
            <button onClick={onCancel} style={styles.cancelBtn}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: 20,
    left: 20,
    background: "rgba(10,10,12,0.80)",
    backdropFilter: "blur(8px)",
    borderRadius: 10,
    padding: "10px 14px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "#e8e0d0",
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    minWidth: 280,
    maxWidth: 340,
    zIndex: 10,
    userSelect: "none",
  },
  hint: {
    color: "#888",
    fontStyle: "italic",
    fontSize: 12,
    textAlign: "center",
    padding: "4px 0",
  },
  undoBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 6,
    color: "#c8c0b8",
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  targetRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  targetLabel: {
    color: "#f5e8c0",
    fontWeight: 500,
    fontSize: 13,
  },
  clearBtn: {
    background: "transparent",
    border: "none",
    color: "#888",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 2px",
    lineHeight: 1,
  },
  inputRow: {
    display: "flex",
    gap: 6,
  },
  input: {
    flex: 1,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 6,
    color: "#f0ece4",
    padding: "5px 9px",
    fontSize: 12,
    outline: "none",
    minWidth: 0,
  },
  askBtn: {
    background: "rgba(245,185,66,0.22)",
    border: "1px solid rgba(245,185,66,0.45)",
    borderRadius: 6,
    color: "#f5e8c0",
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  },
  askBtnDisabled: {
    opacity: 0.4,
    cursor: "default",
  },
  error: {
    color: "#e07060",
    fontSize: 11,
    lineHeight: 1.4,
  },
  diffLine: {
    color: "#f5d080",
    fontWeight: 500,
    fontSize: 13,
    padding: "2px 0",
  },
  actionRow: {
    display: "flex",
    gap: 8,
  },
  applyBtn: {
    flex: 1,
    background: "rgba(80,180,80,0.22)",
    border: "1px solid rgba(80,200,80,0.45)",
    borderRadius: 6,
    color: "#a0e8a0",
    padding: "5px 0",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
  },
  cancelBtn: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 6,
    color: "#c8c0b8",
    padding: "5px 0",
    fontSize: 12,
    cursor: "pointer",
  },
};
