"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PieceView } from "@/lib/content/read/view-types";
import {
  RESEND_LABEL,
  resendQuestion,
  SEND_LABEL,
  SEND_LINE,
  SENDING,
  sentLine,
} from "@/lib/explain/postiz";
import { ConfirmDiscard } from "./ConfirmDiscard";
import { STILL_WAITING } from "./savingPoller";
import { useContentDecision } from "./useContentDecision";

/**
 * "Send to Postiz as a draft" on an approved piece. It only asks the worker; a piece already sent
 * asks "Send it again?" first. Nothing is ever scheduled or posted from Harbour.
 */
export function PostizSend({ piece }: { piece: PieceView }) {
  const postiz = piece.postiz;
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const asked = useRef(false);
  const { busy, error, send, stalled } = useContentDecision(postiz?.sending ?? false);
  // Focus goes back to the send button when the question closes, so the keyboard path is kept.
  useEffect(() => {
    if (confirming) asked.current = true;
    else if (asked.current) button.current?.focus();
  }, [confirming]);
  if (!postiz) return null;
  const go = (resend: boolean) =>
    send({ action: "send-to-postiz", pieceId: piece.id, revision: piece.revision, resend }, () =>
      setConfirming(false),
    );
  const lineId = `postiz-line-${piece.id}`;
  return (
    <div className="flex flex-col gap-2">
      {postiz.sentAt && <p className="text-sm text-ink">{sentLine(postiz.sentAt)}</p>}
      {confirming && postiz.sentAt ? (
        <ConfirmDiscard
          question={resendQuestion(postiz.sentAt)}
          confirmLabel={RESEND_LABEL}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => go(true)}
        />
      ) : (
        <div>
          <Button
            ref={button}
            variant="ghost"
            aria-describedby={lineId}
            disabled={postiz.sending || busy}
            onClick={() => (postiz.sentAt ? setConfirming(true) : go(false))}
          >
            {SEND_LABEL}
          </Button>
        </div>
      )}
      <p id={lineId} className="text-xs text-ink-muted">
        {SEND_LINE}
      </p>
      <p role="status" aria-live="polite" className="text-xs text-ink-muted">
        {stalled ? STILL_WAITING : postiz.sending ? SENDING : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      )}
      {!error && postiz.error && <p className="text-sm text-ink">{postiz.error}</p>}
    </div>
  );
}
