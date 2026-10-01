"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_NOTE } from "@/components/actions/action-labels";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

/** Queues a backup of today for the worker, then opens the job's page to follow it. */
export function BackUpNowButton({
  demo = false,
}: {
  /** /design example: never calls the API. */ demo?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function backUp() {
    setError(null);
    if (demo) return setNote(DEMO_NOTE);
    setBusy(true);
    const result = await postJson<{ jobId: number; created: boolean }>("/api/backups", {});
    if (!result.ok) {
      setBusy(false);
      return setError("Couldn't queue the backup. Try again.");
    }
    router.push(`/agents/${result.data.jobId}`);
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button onClick={backUp} disabled={busy} aria-busy={busy}>
        Back up now
      </Button>
      <p role="status" className="text-xs text-ink-muted">
        {busy ? "Queueing the backup…" : note}
      </p>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
