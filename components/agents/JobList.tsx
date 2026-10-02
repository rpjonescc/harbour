import Link from "next/link";
import { EmptyState } from "@/components/explain/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { formatDuration, jobLabel, type Named } from "@/lib/agents/view";
import { JOB_STATUS_PHRASE } from "@/lib/explain/agents";
import { formatDateTime } from "@/lib/format/date";
import type { Job, JobStatus } from "@/lib/jobs/queue";

const TONE: Record<JobStatus, "accent" | "warn" | "neutral"> = {
  ok: "accent",
  failed: "warn",
  running: "neutral",
  queued: "neutral",
  cancelled: "neutral",
};

/** Recent agent and sync runs, newest first. */
export function JobList({
  jobs,
  products,
  timeZone,
  locale,
  importsGivenUp = new Set(),
}: {
  jobs: Job[];
  products: readonly Named[];
  timeZone: string;
  locale: string;
  /** Runs whose committed suggestions were never imported (see `importsGivenUp`). */
  importsGivenUp?: ReadonlySet<number>;
}) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        what="No runs yet."
        when="Your first run appears here as soon as you start one."
        why="Use the buttons above."
      />
    );
  }
  return (
    <table aria-label="Recent runs" className="w-full text-left text-sm">
      <thead className="text-xs text-ink-muted">
        <tr className="border-b border-line">
          <th scope="col" className="py-2 font-medium">
            Run
          </th>
          <th scope="col" className="py-2 font-medium">
            Status
          </th>
          <th scope="col" className="py-2 font-medium">
            Started
          </th>
          <th scope="col" className="py-2 font-medium">
            Duration
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {jobs.map((job) => (
          <tr key={job.id}>
            <td className="py-2 pr-3">
              <Link href={`/agents/${job.id}`} className="text-accent hover:underline">
                {jobLabel(job, products)}
              </Link>
              {importsGivenUp.has(job.id) && (
                <p className="text-xs text-warn">
                  Claude's ideas from this run weren't saved. Run it again.
                </p>
              )}
            </td>
            <td className="py-2 pr-3">
              <Tag tone={TONE[job.status]}>{JOB_STATUS_PHRASE[job.status]}</Tag>
            </td>
            <td className="py-2 pr-3 text-ink-muted">
              {job.startedAt ? formatDateTime(job.startedAt, timeZone, locale) : "—"}
            </td>
            <td className="py-2 text-ink-muted">{formatDuration(job.startedAt, job.finishedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
