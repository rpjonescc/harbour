"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEMO_NOTE } from "@/components/actions/action-labels";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";
import { NOTE_MESSAGES } from "@/lib/explain/voice/fallback";

const EVERY_MS = 5_000;
/** Ten minutes: the worker may be busy with another run first. Then the button is free again. */
const MAX_REFRESHES = 120;

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "waiting"; jobId: number; since: string | null }
  | { kind: "said"; text: string };

function failure(error: string | null, noteTime: string): string {
  if (error === "rate_limited") return NOTE_MESSAGES.rateLimited(noteTime);
  if (error === "token_missing") return NOTE_MESSAGES.noToken;
  return NOTE_MESSAGES.failed;
}

/**
 * "Write me a fresh one": queues a note job (the worker writes it; the web process never runs an
 * agent), then re-renders the page every 5 seconds, for ten minutes at most, until a newer note
 * shows.
 */
export function FreshNoteButton({
  latestAt,
  tokenSet,
  noteTime,
  demo = false,
}: {
  /** When the note on show was written (ISO), so a newer one ends the wait. */
  latestAt: string | null;
  tokenSet: boolean;
  noteTime: string;
  /** /design example: never queues anything. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (state.kind !== "waiting") return;
    if (latestAt !== state.since) return setState({ kind: "idle" }); // a newer note arrived
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count < MAX_REFRESHES) return;
      clearInterval(timer);
      setState({ kind: "said", text: NOTE_MESSAGES.slow });
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [state, latestAt, router]);

  async function ask() {
    if (demo) return setState({ kind: "said", text: DEMO_NOTE });
    setState({ kind: "busy" });
    const result = await postJson<{ jobIds: number[] }>("/api/agents/run", { kind: "daily-note" });
    const jobId = result.ok ? result.data.jobIds[0] : undefined;
    if (jobId !== undefined) return setState({ kind: "waiting", jobId, since: latestAt });
    setState({ kind: "said", text: failure(result.ok ? null : result.error, noteTime) });
  }

  const message = !tokenSet
    ? NOTE_MESSAGES.noToken
    : state.kind === "waiting"
      ? NOTE_MESSAGES.writing
      : state.kind === "said"
        ? state.text
        : "";
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
      {state.kind === "waiting" && (
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
