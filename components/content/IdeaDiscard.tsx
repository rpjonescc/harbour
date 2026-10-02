"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { IdeaView } from "@/lib/content/read/view-types";
import { ConfirmDiscard } from "./ConfirmDiscard";
import { STILL_WAITING } from "./savingPoller";
import { useContentDecision } from "./useContentDecision";

/** Discards an idea and every piece it has, after a question; the worker does the saving. */
export function IdeaDiscard({ idea }: { idea: IdeaView }) {
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const { busy, error, clearError, send, stalled } = useContentDecision(idea.saving);
  const hasApproved = idea.pieces.some((p) => p.tab === "approved");
  // Focus goes back to the Discard button when the question closes.
  const wasAsking = useRef(false);
  useEffect(() => {
    if (wasAsking.current && !asking) opener.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  const close = () => setAsking(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        ref={opener}
        aria-label={`Discard idea: ${idea.title}`}
        variant="ghost"
        disabled={idea.saving}
        onClick={() => {
          clearError();
          setAsking(true);
        }}
      >
        Discard idea
      </Button>
      {asking && (
        <ConfirmDiscard
          question={
            hasApproved
              ? "Discard this idea and all of its pieces? The exported files of approved pieces are removed too."
              : "Discard this idea and all of its pieces?"
          }
          confirmLabel="Confirm discard of idea"
          confirmName={`Confirm discard of idea: ${idea.title}`}
          busy={busy}
          onCancel={close}
          onConfirm={() => send({ action: "discard", ideaId: idea.id }, close)}
        />
      )}
      <p role="status" aria-live="polite" className="text-xs text-ink-muted">
        {stalled ? STILL_WAITING : idea.saving ? "Saving…" : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      )}
      {!error && idea.decisionError && <p className="text-sm text-ink">{idea.decisionError}</p>}
    </div>
  );
}
