import Link from "next/link";
import { EmptyState } from "@/components/explain/EmptyState";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Tag } from "@/components/ui/Tag";
import { formatDuration, jobLabel, type Named } from "@/lib/agents/view";
import { JOB_STATUS_PHRASE, RUN_META, runSentence } from "@/lib/explain/agents";
import { jobWords } from "@/lib/explain/job-words";
import { FEED_SENTENCE } from "@/lib/explain/tower-activity";
import { formatDateTime } from "@/lib/format/date";
import type { Job, JobStatus } from "@/lib/jobs/queue";

const TONE: Record<JobStatus, "accent" | "warn" | "neutral"> = {
  ok: "accent",
  failed: "warn",
  running: "neutral",
  queued: "neutral",
  cancelled: "neutral",
};

type Props = {
  jobs: Job[];
  products: readonly Named[];
  timeZone: string;
  locale: string;
  /** Runs whose committed suggestions were never imported (see `importsGivenUp`). */
  importsGivenUp?: ReadonlySet<number>;
};

/** "Started 4 Oct, 09:00 · took 5m 00s", or "Not started yet". */
function metaLine(job: Job, timeZone: string, locale: string): string {
  if (!job.startedAt) return RUN_META.notStarted;
  const started = RUN_META.started(formatDateTime(job.startedAt, timeZone, locale));
  return job.finishedAt
    ? `${started} · ${RUN_META.took(formatDuration(job.startedAt, job.finishedAt))}`
    : started;
}

/**
 * Recent agent and sync runs, newest first, each said in plain words like Today's feed. One row
 * per run that stacks on a phone (no sideways scroll); job names only under Technical details.
 */
export function JobList({ jobs, products, timeZone, locale, importsGivenUp = new Set() }: Props) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        what="No runs yet."
        when="Your first run appears here as soon as you start one."
        why="Use the buttons above."
      />
    );
  }
  const rows = jobs.map((job) => ({
    job,
    sentence: runSentence(job.status, jobWords(job, products)),
  }));
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Recent runs" className="divide-y divide-line text-sm">
        {rows.map(({ job, sentence }) => (
          <li
            key={job.id}
            className="flex flex-col gap-x-3 py-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <Link
                href={`/agents/${job.id}`}
                className="inline-flex min-h-11 items-center rounded-sm text-accent hover:underline"
              >
                {sentence}
              </Link>
              {importsGivenUp.has(job.id) && (
                <p className="text-xs text-warn">{RUN_META.importsGivenUp}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 text-xs text-ink-muted sm:shrink-0 sm:pb-0">
              <Tag tone={TONE[job.status]}>{JOB_STATUS_PHRASE[job.status]}</Tag>
              <span>{metaLine(job, timeZone, locale)}</span>
            </div>
          </li>
        ))}
      </ul>
      <TechnicalDetails id="agents-recent-runs" topic={RUN_META.technicalTopic}>
        <ul className="flex flex-col gap-1 text-ink-muted">
          {rows.map(({ job, sentence }) => (
            <li key={job.id}>
              {sentence} {FEED_SENTENCE.technical(jobLabel(job, products), job.kind)}
            </li>
          ))}
        </ul>
      </TechnicalDetails>
    </div>
  );
}
