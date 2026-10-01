import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { formatDuration, jobLabel } from "@/lib/agents/view";
import { formatDateTime } from "@/lib/format/date";
import type { Job, JobStatus } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";

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
}: {
  jobs: Job[];
  products: readonly Product[];
  timeZone: string;
  locale: string;
}) {
  if (jobs.length === 0) return <p className="text-sm text-ink-muted">No runs yet.</p>;
  return (
    <table aria-label="Agent runs" className="w-full text-left text-sm">
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
            </td>
            <td className="py-2 pr-3">
              <Tag tone={TONE[job.status]}>{job.status}</Tag>
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
