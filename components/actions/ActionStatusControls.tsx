"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import type { ActionStatus } from "@/lib/actions/types";
import { postJson } from "@/lib/auth/client-api";
import { SIGN_IN_ENDED } from "@/lib/explain/actions";
import { useBoardAnnouncer } from "./ActionAnnouncer";
import { STATUS_CONTROLS, type StatusControl } from "./action-labels";
import { type ChangeSnapshot, snapshotBoard } from "./focus-after-change";
import { SnoozeForm } from "./SnoozeForm";

// The server refuses a click made on a status that has since changed (409, or 404 if gone).
const CHANGED = new Set(["stale", "not_allowed", "until_required", "conflict", "not_found"]);

function failureMessage(error: string): string {
  if (error === "unauthenticated") return SIGN_IN_ENDED;
  if (error === "until_invalid") return "Pick a date between tomorrow and a year from now.";
  if (CHANGED.has(error)) {
    return "This card changed since you opened it, so Harbour refreshed the board. Check it and try again.";
  }
  return "That change wasn't saved. Try again in a moment.";
}

/**
 * The owner's status buttons for one action: only the allowed moves, then a refresh. In demo
 * mode (the /design examples) nothing is ever sent.
 */
export function ActionStatusControls({
  id,
  title,
  status,
  today,
  demo = false,
}: {
  id: number;
  title: string;
  status: ActionStatus;
  /** YYYY-MM-DD in HARBOUR_TIMEZONE, for the snooze range. */
  today: string;
  demo?: boolean;
}) {
  const router = useRouter();
  const board = useBoardAnnouncer();
  const snoozeTrigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // Inside a board, messages go to its regions so they outlive this card.
  const announce = board?.announce ?? setNote;
  const report = board?.alert ?? setError;

  function refresh(snapshot: ChangeSnapshot) {
    if (board) board.afterChange(snapshot, () => router.refresh());
    else router.refresh();
  }

  async function change(control: StatusControl, until?: string) {
    // Clear first, so a repeat of the same message is announced again.
    announce("");
    report("");
    if (demo) {
      setSnoozing(false);
      return announce(DEMO_NOTE);
    }
    setBusy(true);
    const snapshot = snapshotBoard(id);
    const body = { from: status, to: control.to, ...(until ? { until } : {}) };
    const result = await postJson<{ id: number; status: ActionStatus }>(`/api/actions/${id}`, body);
    setBusy(false);
    if (!result.ok) {
      report(failureMessage(result.error));
      if (CHANGED.has(result.error)) refresh(snapshot);
      return;
    }
    setSnoozing(false);
    announce(`${control.done}: ${title}`);
    refresh(snapshot);
  }

  function cancelSnooze() {
    setSnoozing(false);
    snoozeTrigger.current?.focus();
  }

  const controls = STATUS_CONTROLS[status];
  const snooze = controls.find((c) => c.to === "snoozed");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {controls.map((control, index) => (
          <Button
            key={control.label}
            ref={control === snooze ? snoozeTrigger : undefined}
            variant={index === 0 ? "primary" : "ghost"}
            disabled={busy}
            aria-label={`${control.label}: ${title}`}
            aria-expanded={control === snooze ? snoozing : undefined}
            aria-controls={control === snooze && snoozing ? `snooze-${id}` : undefined}
            onClick={() => (control === snooze ? setSnoozing((open) => !open) : change(control))}
          >
            {control.label}
          </Button>
        ))}
      </div>
      {snoozing && snooze && (
        <SnoozeForm
          id={id}
          title={title}
          today={today}
          busy={busy}
          onSnooze={(until) => change(snooze, until)}
          onCancel={cancelSnooze}
        />
      )}
      {!board && error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
      {!board && (
        <p role="status" className="text-xs text-ink-muted">
          {note}
        </p>
      )}
    </div>
  );
}
