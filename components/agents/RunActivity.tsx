"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDuration, isActive } from "@/lib/agents/view";
import { postJson } from "@/lib/auth/client-api";
import type { EventKind } from "@/lib/jobs/queue";
import type { RunEvent, RunJob } from "./run-types";
import { useRunPolling } from "./useRunPolling";

const EVENT_TONE: Record<EventKind, string> = {
  error: "text-bad",
  tool: "text-ink-muted",
  status: "text-ink",
  text: "text-ink",
};

const STATUS_TEXT: Record<RunJob["status"], string> = {
  queued: "Queued — waiting for the worker",
  running: "Running",
  ok: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
};

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);

/** Elapsed time; while running it ticks each second (client-only, so no hydration mismatch). */
function useElapsed(job: RunJob): string {
  const [now, setNow] = useState<Date | null>(null);
  const running = job.status === "running";
  useEffect(() => {
    if (!running) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const start = toDate(job.startedAt);
  return formatDuration(start, toDate(job.finishedAt) ?? (running ? now : null));
}

/** Live status, activity and cancel control for one run. */
export function RunActivity({
  job: initialJob,
  events: initialEvents,
}: {
  job: RunJob;
  events: RunEvent[];
}) {
  const router = useRouter();
  const { job, setJob, events, lostConnection } = useRunPolling(initialJob, initialEvents);
  const [cancelState, setCancelState] = useState<"idle" | "busy" | "requested" | "failed">("idle");
  const elapsed = useElapsed(job);
  const active = isActive(job.status);

  // Once the run finishes, refresh server-rendered parts (files changed, run list).
  const wasActive = useRef(isActive(initialJob.status));
  useEffect(() => {
    if (wasActive.current && !active) router.refresh();
    wasActive.current = active;
  }, [active, router]);

  async function cancel() {
    setCancelState("busy");
    const result = await postJson<{ result: "cancelled" | "requested" | "not-active" }>(
      `/api/agents/${job.id}/cancel`,
    );
    if (!result.ok) return setCancelState("failed");
    if (result.data.result === "cancelled")
      setJob((current) => ({ ...current, status: "cancelled" }));
    setCancelState(result.data.result === "requested" ? "requested" : "idle");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-ink">
          {STATUS_TEXT[job.status]}
          {cancelState === "requested" && active && " — stopping…"}
          <span className="text-ink-muted"> · {elapsed}</span>
        </p>
        {active && (
          <Button
            variant="ghost"
            onClick={cancel}
            disabled={cancelState === "busy" || cancelState === "requested"}
          >
            Cancel
          </Button>
        )}
      </div>
      {job.status === "failed" && job.error && (
        <div role="alert" className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-bad">
          {job.error}
        </div>
      )}
      {cancelState === "failed" && (
        <p role="alert" className="text-sm text-bad">
          Couldn't cancel. Try again.
        </p>
      )}
      {lostConnection && (
        <p role="alert" className="text-sm text-bad">
          Lost contact with Harbour — retrying.
        </p>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">No activity yet.</p>
      ) : (
        <ol aria-label="Run activity" className="flex flex-col gap-1 font-mono text-xs">
          {events.map((event) => (
            <li key={event.id} className={EVENT_TONE[event.kind]}>
              {event.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
