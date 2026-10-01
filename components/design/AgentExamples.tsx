import { JobList } from "@/components/agents/JobList";
import { WeeklyAnalystPanel } from "@/components/agents/WeeklyAnalystPanel";
import type { Job } from "@/lib/jobs/queue";

const AT = new Date("2026-10-04T19:00:00Z");

/** A fictional weekly run whose suggestions ran out of import attempts. */
const GIVEN_UP: Job = {
  id: 9001,
  kind: "weekly-analyst",
  params: { week: "2026-W40" },
  dedupeKey: "weekly-analyst:example",
  status: "ok",
  requestedBy: null,
  createdAt: AT,
  startedAt: AT,
  finishedAt: new Date(AT.getTime() + 4 * 60_000),
  heartbeatAt: null,
  cancelRequested: false,
  notBefore: null,
  error: null,
};

/** Fictional Agents page states: the weekly report panel and a run whose import gave up. */
export function AgentExamples() {
  return (
    <div className="flex flex-col gap-6">
      <WeeklyAnalystPanel
        view={{
          nextRun: "Sunday 11 Oct, 20:00",
          latestReport: { week: "2026-W40", href: "/brain/reports/weekly/2026-W40.md" },
          tokenSet: true,
        }}
      />
      <WeeklyAnalystPanel view={{ nextRun: null, latestReport: null, tokenSet: false }} />
      <JobList
        jobs={[GIVEN_UP]}
        products={[]}
        timeZone="Europe/London"
        locale="en-GB"
        importsGivenUp={new Set([GIVEN_UP.id])}
      />
    </div>
  );
}
