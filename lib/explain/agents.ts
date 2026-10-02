import type { JobKind, JobStatus } from "@/lib/jobs/queue";
import { NOTE_RUN_FAILED_LINE } from "./voice/fallback";

// A fixed note text: it lives with the note texts so their tone rules cover it.
export { NOTE_RUN_FAILED_LINE };

export const AGENTS_INTRO =
  "Claude's background work, saved to your Second Brain. One job runs at a time.";

export const AGENT_PURPOSE = {
  research: "Claude reads up on a topic and writes it into your Second Brain.",
  ideas: "Claude suggests keywords and questions worth tracking for each site.",
  weekly: "Every Sunday Claude writes a short report on how your sites are doing.",
  refresh: "Claude re-reads research notes that have gone out of date.",
  recent: "What Claude and Harbour have run lately.",
} as const;

/** The status column in the run list. */
export const JOB_STATUS_PHRASE: Readonly<Record<JobStatus, string>> = {
  queued: "Waiting",
  running: "Running",
  ok: "Done",
  failed: "Didn't finish",
  cancelled: "Stopped",
};

/** The headline on a run's own page. */
export const RUN_HEADLINE: Readonly<Record<JobStatus, string>> = {
  queued: "Waiting for its turn",
  running: "Running now",
  ok: "Done",
  failed: "Didn't finish",
  cancelled: "Stopped",
};

export const RUN_FAILED_LINE =
  "This run didn't finish. You can start it again from the Agents page.";

/** What to do next when a run didn't finish: only agent runs can be started from Agents. */
const RUN_FAILED_NEXT_STEP: Readonly<Partial<Record<JobKind, string>>> = {
  "daily-note": NOTE_RUN_FAILED_LINE,
  scan: "This check didn't finish. Choose Check now on the product's page.",
  backup: "This backup didn't finish. Choose Back up now in Settings.",
  retention: "This tidy-up didn't finish. Harbour tries again at the next run.",
  "brain-push": "This sync didn't finish. Harbour tries again at the next run.",
  "notes-sync": "This sync didn't finish. Harbour tries again at the next run.",
  // Content jobs are started from the Content page, not from Agents.
  "content-digest":
    "This digest didn't finish. Choose Make today's digest now on the Content page.",
  "content-ideas": "This idea run didn't finish. Choose Find new ideas on the Content page.",
  "content-draft": "This step didn't finish. Choose Try again on the Content page.",
  "content-atomise": "This step didn't finish. Choose Try again on the Content page.",
  "content-gate": "This step didn't finish. Choose Try again on the Content page.",
  "content-decision":
    "This decision didn't save. Choose Approve, Edit or Discard again on the Content page.",
};

/** The message under a failed run, with the right next step for its kind. */
export function runFailedLine(kind: JobKind): string {
  return RUN_FAILED_NEXT_STEP[kind] ?? RUN_FAILED_LINE;
}

/** Names the log's Technical details for screen readers. */
export const RUN_LOG_TOPIC = "step-by-step log of the run";
