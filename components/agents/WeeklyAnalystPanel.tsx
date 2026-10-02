"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { WeeklyPanelView } from "@/lib/analyst/panel-view";
import { postJson } from "@/lib/auth/client-api";
import { AGENT_PURPOSE } from "@/lib/explain/agents";
import { CLAUDE_OFF_HERE } from "@/lib/explain/claude";

/** The weekly report: when it next runs, the latest one, and Run now. */
export function WeeklyAnalystPanel({ view }: { view: WeeklyPanelView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const whyDisabledId = useId();

  async function runNow() {
    setBusy(true);
    setError(null);
    const result = await postJson<{ jobIds: number[] }>("/api/agents/run", {
      kind: "weekly-analyst",
    });
    const jobId = result.ok ? result.data.jobIds[0] : undefined;
    if (jobId === undefined) {
      setBusy(false);
      return setError("Couldn't start the report. Try again.");
    }
    router.push(`/agents/${jobId}`);
  }

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Weekly report</h2>
        <Button
          onClick={runNow}
          disabled={busy || !view.tokenSet}
          aria-describedby={view.tokenSet ? undefined : whyDisabledId}
        >
          Write this week's report now
        </Button>
      </div>
      {!view.tokenSet && (
        <p id={whyDisabledId} className="text-sm text-ink-muted">
          {CLAUDE_OFF_HERE}
        </p>
      )}
      <p className="text-sm text-ink-muted">{AGENT_PURPOSE.weekly}</p>
      <p className="text-sm text-ink-muted">{view.schedule}</p>
      {view.latestReport ? (
        <p className="text-sm">
          <Link href={view.latestReport.href} className="rounded-sm text-accent hover:underline">
            Latest report: {view.latestReport.week}
          </Link>
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          No report yet. The first one arrives on Sunday, or write one now.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </Panel>
  );
}
