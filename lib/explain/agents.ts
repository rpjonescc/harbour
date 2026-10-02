import type { JobStatus } from "@/lib/jobs/queue";

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

/** A daily note is asked for on Today, not on the Agents page. */
export const NOTE_RUN_FAILED_LINE =
  "This note didn't get written. You can ask for a fresh one on Today.";

/** Names the log's Technical details for screen readers. */
export const RUN_LOG_TOPIC = "step-by-step log of the run";
