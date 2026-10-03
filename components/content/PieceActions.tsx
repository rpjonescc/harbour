"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PieceView } from "@/lib/content/read/view-types";
import { ApprovePanel } from "./ApprovePanel";
import { ConfirmDiscard } from "./ConfirmDiscard";
import { EditPanel } from "./EditPanel";
import { STILL_WAITING } from "./savingPoller";
import { useContentDecision } from "./useContentDecision";

type Mode = "idle" | "approve" | "edit" | "discard";

/** Approve, Edit and Discard for one piece: each only asks the worker, and says "Saving…" until it has. */
export function PieceActions({ piece }: { piece: PieceView }) {
  const [mode, setMode] = useState<Mode>("idle");
  const opener = useRef<HTMLElement | null>(null);
  const { busy, error, clearError, send, stalled } = useContentDecision(piece.saving);

  const open = (next: Mode) => (event: React.MouseEvent<HTMLElement>) => {
    opener.current = event.currentTarget;
    clearError();
    setMode(next);
  };
  // Focus goes back to the button that opened the panel, so the keyboard path is not lost.
  useEffect(() => {
    if (mode === "idle") opener.current?.focus();
  }, [mode]);
  const close = () => setMode("idle");
  const base = { pieceId: piece.id, revision: piece.revision };
  const decidable = (piece.tab === "ready" || piece.tab === "needs-you") && !piece.retry;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {decidable && !piece.empty && (
          <Button
            variant="ghost"
            onClick={open("approve")}
            disabled={piece.saving}
            aria-label={`Approve: ${piece.title}`}
          >
            Approve
          </Button>
        )}
        {decidable && !piece.empty && (
          <Button
            variant="ghost"
            onClick={open("edit")}
            disabled={piece.saving}
            aria-label={`Edit: ${piece.title}`}
          >
            Edit
          </Button>
        )}
        {piece.tab !== "discarded" && (
          <Button
            variant="ghost"
            onClick={open("discard")}
            disabled={piece.saving}
            aria-label={`Discard: ${piece.title}`}
          >
            Discard
          </Button>
        )}
      </div>
      {mode === "approve" && (
        <ApprovePanel
          piece={piece}
          busy={busy}
          onCancel={close}
          onConfirm={(checkedFlags, confirmOpen) =>
            send({ action: "approve", ...base, checkedFlags, confirmOpen }, close)
          }
        />
      )}
      {mode === "edit" && (
        <EditPanel
          piece={piece}
          busy={busy}
          onCancel={close}
          onSave={(body) => send({ action: "edit", ...base, body }, close)}
        />
      )}
      {mode === "discard" && (
        <ConfirmDiscard
          question="Discard this piece?"
          confirmLabel="Confirm discard"
          confirmName={`Confirm discard: ${piece.title}`}
          busy={busy}
          onCancel={close}
          onConfirm={() => send({ action: "discard", ...base }, close)}
        />
      )}
      <p role="status" aria-live="polite" className="text-xs text-ink-muted">
        {stalled ? STILL_WAITING : piece.saving ? "Saving…" : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      )}
      {!error && piece.decisionError && <p className="text-sm text-ink">{piece.decisionError}</p>}
    </div>
  );
}
