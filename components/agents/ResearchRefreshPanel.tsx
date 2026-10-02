"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { RefreshPanelView } from "@/lib/agents/refresh-view";
import { postJson } from "@/lib/auth/client-api";
import { AGENT_PURPOSE } from "@/lib/explain/agents";
import { CLAUDE_OFF_HERE } from "@/lib/explain/claude";

function queuedNotice(count: number, stale: number): string {
  if (count === 0) {
    return stale > 0 ? "Everything out of date is already waiting" : "Nothing is out of date";
  }
  return `Started ${count} ${count === 1 ? "update" : "updates"}`;
}

function whyDisabled(view: RefreshPanelView): string | null {
  if (!view.tokenSet) return CLAUDE_OFF_HERE;
  if (view.due.length === 0) return "Nothing is out of date.";
  return null;
}

/** The monthly research refresh: when it next runs, what is due, and Update old research. */
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
    if (!result.ok) return setError("Couldn't start the update. Try again.");
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
          Update old research
        </Button>
      </div>
      {why !== null && (
        <p id={whyId} className="text-sm text-ink-muted">
          {why}
        </p>
      )}
      <p className="text-sm text-ink-muted">{AGENT_PURPOSE.refresh}</p>
      <p className="text-sm text-ink-muted">{view.schedule}</p>
      <p className="text-sm">
        {dueCount} of {view.total} research notes {dueCount === 1 ? "is" : "are"} out of date
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
          {view.missing} not written yet: run the research above
        </p>
      )}
      <p className="text-sm text-ink-muted">
        Each update re-reads up to 3 notes, oldest first. A note counts as old after 30 days.
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
