"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";
import { SYNC_UNCHECKED } from "@/lib/explain/brain-sync";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Whether the owner's notes are saved and pushed. Saving and syncing are automatic; the buttons
 * are optional shortcuts. `paused` is true while an interrupted agent run is being recovered.
 * `unpushed` is null when Harbour could not count the commits waiting to reach GitHub.
 */
export function BrainSyncBanner({
  unsaved,
  unpushed,
  paused = false,
  quietWhenSynced = false,
}: {
  unsaved: number;
  unpushed: number | null;
  paused?: boolean;
  /** The page's verdict already says "saved and synced", so say nothing when all is clear. */
  quietWhenSynced?: boolean;
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
    return quietWhenSynced ? null : <p className="text-xs text-ink-muted">Saved · synced</p>;
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
              ? "not saved yet — saving resumes once recovery finishes"
              : "will be saved automatically soon"}
          </span>
          {!paused && (
            <Button variant="ghost" onClick={saveNow} disabled={busy}>
              Save now
            </Button>
          )}
        </div>
      )}
      {unpushed === null && <p>{SYNC_UNCHECKED}</p>}
      {unpushed !== null && unpushed > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {unpushed} saved {unpushed === 1 ? "change is" : "changes are"} waiting to reach GitHub
            — Harbour keeps retrying
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
