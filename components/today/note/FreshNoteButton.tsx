"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import { postJson } from "@/lib/auth/client-api";
import { NOTE_MESSAGES } from "@/lib/explain/voice/fallback";
import type { LatestRun } from "@/lib/note/view";
import { endOfWait } from "./end-of-wait";

const EVERY_MS = 5_000;
/** Ten minutes: the worker may be busy with another run first. Then the button is free again. */
const MAX_REFRESHES = 120;

/** The states /design shows without anything having happened. */
export type ExampleButtonState = "waiting" | "rate-limited" | "failed" | "rejected";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "waiting"; jobId: number; since: string | null }
  | { kind: "said"; text: string };

function failure(error: string | null, noteTime: string | null): string {
  if (error === "rate_limited") return NOTE_MESSAGES.rateLimited(noteTime);
  if (error === "token_missing") return NOTE_MESSAGES.noToken;
  return NOTE_MESSAGES.failed;
}

function exampleState(example: ExampleButtonState | undefined, noteTime: string | null): State {
  if (example === "waiting") return { kind: "waiting", jobId: 0, since: null };
  if (example === "rate-limited")
    return { kind: "said", text: NOTE_MESSAGES.rateLimited(noteTime) };
  if (example === "failed") return { kind: "said", text: NOTE_MESSAGES.failed };
  if (example === "rejected") return { kind: "said", text: NOTE_MESSAGES.rejected };
  return { kind: "idle" };
}

function messageFor(state: State): string {
  if (state.kind === "busy") return NOTE_MESSAGES.starting;
  if (state.kind === "waiting") return NOTE_MESSAGES.writing;
  return state.kind === "said" ? state.text : "";
}

/**
 * "Write me a fresh one": queues a note job (the worker writes it; the web process never runs an
 * agent), then re-renders the page every 5 seconds, for ten minutes at most, until its run ends:
 * a newer note shows, the run succeeded, or the run failed (the checker rejected the note twice,
 * or the run broke), which is said calmly.
 */
export function FreshNoteButton({
  latestAt,
  latestRun,
  tokenSet,
  noteTime,
  demo = false,
  demoState,
}: {
  /** When the note on show was written (ISO), so a newer one ends the wait. */
  latestAt: string | null;
  /** The newest note run, so a failed one ends the wait too. */
  latestRun: LatestRun | null;
  tokenSet: boolean;
  /** When the next scheduled note is written; null when no schedule runs. */
  noteTime: string | null;
  /** /design example: never queues, refreshes or links to anything. */
  demo?: boolean;
  /** /design example: the state to show without anything having happened. */
  demoState?: ExampleButtonState;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(() => exampleState(demoState, noteTime));
  // A ref, so a new router object (which restarts the timer) cannot restart the ten minutes.
  const refreshes = useRef(0);

  useEffect(() => {
    if (demo || state.kind !== "waiting") return;
    const ended = endOfWait(state, latestAt, latestRun);
    if (ended === "done") setState({ kind: "idle" });
    if (ended === "failed") setState({ kind: "said", text: NOTE_MESSAGES.rejected });
  }, [demo, state, latestAt, latestRun]);

  useEffect(() => {
    if (demo || state.kind !== "waiting") return;
    const timer = setInterval(() => {
      refreshes.current += 1;
      router.refresh();
      if (refreshes.current < MAX_REFRESHES) return;
      clearInterval(timer);
      setState({ kind: "said", text: NOTE_MESSAGES.slow });
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [demo, state.kind, router]);

  async function ask() {
    if (demo) return setState({ kind: "said", text: DEMO_NOTE });
    refreshes.current = 0;
    setState({ kind: "busy" });
    const result = await postJson<{ jobIds: number[] }>("/api/agents/run", { kind: "daily-note" });
    const jobId = result.ok ? result.data.jobIds[0] : undefined;
    if (jobId !== undefined) return setState({ kind: "waiting", jobId, since: latestAt });
    setState({ kind: "said", text: failure(result.ok ? null : result.error, noteTime) });
  }

  const message = !tokenSet ? NOTE_MESSAGES.noToken : messageFor(state);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="ghost"
        onClick={ask}
        disabled={!tokenSet || state.kind === "busy" || state.kind === "waiting"}
      >
        Write me a fresh one
      </Button>
      <p role="status" className="text-xs text-ink-muted">
        {message}
      </p>
      {state.kind === "waiting" && !demo && (
        <Link
          href={`/agents/${state.jobId}`}
          className="rounded-sm text-xs text-accent hover:underline"
        >
          Follow the run
        </Link>
      )}
    </div>
  );
}
