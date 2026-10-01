"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ActionStatus } from "@/lib/actions/types";
import { postJson } from "@/lib/auth/client-api";
import { useBoardAnnouncer } from "./ActionAnnouncer";
import { STATUS_CONTROLS, type StatusControl } from "./action-labels";
import { SnoozeForm } from "./SnoozeForm";

// The server refuses a click made on a status that has since changed (409).
const CHANGED = new Set(["stale", "not_allowed", "until_required", "conflict", "not_found"]);

/** The owner's status buttons for one action: only the allowed moves, then a refresh. */
export function ActionStatusControls({
  id,
  title,
  status,
  today,
}: {
  id: number;
  title: string;
  status: ActionStatus;
  /** YYYY-MM-DD in HARBOUR_TIMEZONE, for the snooze range. */
  today: string;
}) {
  const router = useRouter();
  const board = useBoardAnnouncer();
  const snoozeTrigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const announce = board ?? setNote;

  async function change(control: StatusControl, until?: string) {
    setBusy(true);
    setError(null);
    // Clear first, so a repeat of the same message is announced again.
    announce("");
    const body = { from: status, to: control.to, ...(until ? { until } : {}) };
    const result = await postJson<{ id: number; status: ActionStatus }>(`/api/actions/${id}`, body);
    setBusy(false);
    if (!result.ok) {
      if (result.error === "until_invalid") {
        return setError("Pick a date between tomorrow and a year from now.");
      }
      if (!CHANGED.has(result.error)) return setError("Couldn't update the action — try again.");
      setError("This action changed meanwhile — refreshed.");
      return router.refresh();
    }
    setSnoozing(false);
    announce(`${control.done}: ${title}`);
    router.refresh();
  }

  function cancelSnooze() {
    setSnoozing(false);
    snoozeTrigger.current?.focus();
  }

  const snooze = STATUS_CONTROLS[status].find((c) => c.to === "snoozed");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_CONTROLS[status].map((control) =>
          control.to === "snoozed" ? (
            <Button
              key={control.label}
              ref={snoozeTrigger}
              variant="ghost"
              disabled={busy}
              aria-label={`${control.label}: ${title}`}
              aria-expanded={snoozing}
              aria-controls={snoozing ? `snooze-${id}` : undefined}
              onClick={() => setSnoozing((open) => !open)}
            >
              {control.label}
            </Button>
          ) : (
            <Button
              key={control.label}
              variant={control === STATUS_CONTROLS[status][0] ? "primary" : "ghost"}
              disabled={busy}
              aria-label={`${control.label}: ${title}`}
              onClick={() => change(control)}
            >
              {control.label}
            </Button>
          ),
        )}
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
      {error && (
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
