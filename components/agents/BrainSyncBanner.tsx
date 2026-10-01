"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Whether the owner's notes are saved and pushed. Saving and syncing are automatic; the buttons
 * are optional shortcuts. `paused` is true while an interrupted agent run is being recovered.
 */
export function BrainSyncBanner({
  unsaved,
  unpushed,
  paused = false,
}: {
  unsaved: number;
  unpushed: number;
  paused?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger(url: string, failure: string, after: (jobId: number) => void) {
    setBusy(true);
    setError(null);
    const result = await postJson<{ jobId: number }>(url);
    setBusy(false);
    if (!result.ok) return setError(failure);
    after(result.data.jobId);
  }
  const saveNow = () =>
    trigger("/api/agents/notes-sync", "Couldn't start saving. Try again.", (jobId) =>
      router.push(`/agents/${jobId}`),
    );
  const retryNow = () =>
    trigger("/api/agents/brain-push", "Couldn't start syncing. Try again.", () => router.refresh());

  if (unsaved === 0 && unpushed === 0) {
    return <p className="text-xs text-ink-muted">Saved · synced</p>;
  }
  return (
    <section
      aria-label="Brain sync"
      className="flex flex-col gap-2 rounded-sm bg-surface-sunk px-3 py-2 text-sm text-ink"
    >
      {unsaved > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {plural(unsaved, "note file", "note files")}{" "}
            {paused
              ? "not saved yet — autosave resumes once recovery finishes"
              : "will be saved automatically when the brain is quiet (before the next agent run at the latest)"}
          </span>
          {!paused && (
            <Button variant="ghost" onClick={saveNow} disabled={busy}>
              Save now
            </Button>
          )}
        </div>
      )}
      {unpushed > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {plural(unpushed, "brain commit", "brain commits")} waiting to sync to GitHub — retrying
            automatically
          </span>
          <Button variant="ghost" onClick={retryNow} disabled={busy}>
            Retry now
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
