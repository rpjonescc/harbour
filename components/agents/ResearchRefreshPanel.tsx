"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { RefreshPanelView } from "@/lib/agents/refresh-view";
import { postJson } from "@/lib/auth/client-api";

function queuedNotice(count: number, stale: number): string {
  if (count === 0) return stale > 0 ? "Every stale document is already queued" : "Nothing is stale";
  return `Queued ${count} ${count === 1 ? "refresh" : "refreshes"}`;
}

function whyDisabled(view: RefreshPanelView): string | null {
  if (!view.tokenSet) return "Refreshing needs a Claude token (HARBOUR_CLAUDE_OAUTH_TOKEN).";
  if (view.due.length === 0) return "Nothing is due for a refresh.";
  return null;
}

/** The monthly research refresh: when it next runs, what is due, and Refresh stale research. */
export function ResearchRefreshPanel({ view }: { view: RefreshPanelView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const whyId = useId();
  const why = whyDisabled(view);
  const dueCount = view.due.length;

  async function refresh() {
    setBusy(true);
    setError(null);
    setNotice("");
    const result = await postJson<{ jobIds: number[]; stale: number }>("/api/agents/run", {
      kind: "refresh",
    });
    setBusy(false);
    if (!result.ok) return setError("Couldn't queue the refresh. Try again.");
    setNotice(queuedNotice(result.data.jobIds.length, result.data.stale));
    router.refresh();
  }

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Research refresh</h2>
        <Button
          onClick={refresh}
          disabled={busy || why !== null}
          aria-describedby={why === null ? undefined : whyId}
        >
          Refresh stale research
        </Button>
      </div>
      {why !== null && (
        <p id={whyId} className="text-sm text-ink-muted">
          {why}
        </p>
      )}
      <p className="text-sm text-ink-muted">{view.schedule}</p>
      <p className="text-sm">
        {dueCount} of {view.total} documents {dueCount === 1 ? "is" : "are"} due for a refresh
      </p>
      {dueCount > 0 && (
        <ul className="divide-y divide-line">
          {view.due.map((doc) => (
            <li key={doc.title} className="py-1.5 text-sm">
              {doc.title} <span className="text-ink-muted">— {doc.age}</span>
            </li>
          ))}
        </ul>
      )}
      {view.missing > 0 && (
        <p className="text-sm text-ink-muted">
          {view.missing} not written yet — run the research sprint
        </p>
      )}
      <p className="text-sm text-ink-muted">
        Each refresh re-checks up to 3 documents, oldest first. A document is due 30 days after it
        was researched.
      </p>
      <p role="status" aria-live="polite" className="text-sm text-ink-muted">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </Panel>
  );
}
