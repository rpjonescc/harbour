import type { JobKind, JobStatus } from "@/lib/jobs/queue";
import { type JobWords, sentenceCase } from "./job-words";
import { count, type PageVerdict, sentences } from "./page-verdict";
import type { TermLine } from "./term-line";
import type { LightTone } from "./tower";
import { FEED_SENTENCE } from "./tower-activity";
import { NOTE_RUN_FAILED_LINE } from "./voice/fallback";

// A fixed note text: it lives with the note texts so their tone rules cover it.
export { NOTE_RUN_FAILED_LINE };

export const AGENTS_INTRO: TermLine = [
  "Each ",
  { term: "agent", text: "agent" },
  " is Claude doing one job in the background, saved to your ",
  { term: "second-brain", text: "Second Brain" },
  ". One ",
  { term: "run", text: "run" },
  " happens at a time.",
];

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

/** The light beside a run's headline: busy while it waits or runs, worth a look if it failed. */
export const RUN_TONE: Readonly<Record<JobStatus, LightTone>> = {
  queued: "busy",
  running: "busy",
  ok: "ok",
  failed: "watch",
  cancelled: "off",
};

/**
 * A run in the Recent runs list, said the way Today's feed says it ("Checked Acme Docs.",
 * "Didn't finish writing the weekly report."): never its job name, which stays in Technical details.
 */
export function runSentence(status: JobStatus, words: JobWords): string {
  switch (status) {
    case "ok":
      return FEED_SENTENCE.done(words.done);
    case "failed":
      return FEED_SENTENCE.failed(words.doing);
    case "running":
      return FEED_SENTENCE.running(words.doing);
    case "queued":
      return FEED_SENTENCE.waiting(words.doing);
    case "cancelled":
      return `Stopped ${words.doing}.`;
  }
}

/** The small line under a run: when it started and how long it took. */
export const RUN_META = {
  started: (when: string) => `Started ${when}`,
  finished: (when: string) => `Finished ${when}`,
  notStarted: "Not started yet",
  took: (duration: string) => `took ${duration}`,
  technicalTopic: "the job names of these runs",
  importsGivenUp: "Claude's ideas from this run weren't saved. Run it again.",
} as const;

export const RUN_FAILED_LINE =
  "This run didn't finish. You can start it again from the Agents page.";

/** What to do next when a run didn't finish: only agent runs can be started from Agents. */
const RUN_FAILED_NEXT_STEP: Readonly<Partial<Record<JobKind, string>>> = {
  "daily-note": NOTE_RUN_FAILED_LINE,
  scan: "This check didn't finish. Choose Check now on the product's page.",
  "outside-check": "This check didn't finish. Choose Run this check now on the product's page.",
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
  "content-postiz":
    "This send to Postiz didn't finish. Look in Postiz first, then choose Send to Postiz as a draft on the Content page if the draft isn't there.",
};

/** The message under a failed run, with the right next step for its kind. */
export function runFailedLine(kind: JobKind): string {
  return RUN_FAILED_NEXT_STEP[kind] ?? RUN_FAILED_LINE;
}

/** Names the log's Technical details for screen readers. */
export const RUN_LOG_TOPIC = "step-by-step log of the run";

/** How many finished runs the Agents verdict looks back over. */
const RECENT_RUNS = 5;

/** A run as the Agents verdict reads it: its status and, for a running one, what it is doing. */
export type VerdictRun = { status: JobStatus; doing: string };

/** "Nothing is running." or what is running now, with how many wait behind it. */
function runningNow(runs: readonly VerdictRun[]): string {
  const running = runs.find((run) => run.status === "running");
  const waiting = runs.filter((run) => run.status === "queued").length;
  const behind = waiting > 0 ? ` ${count(waiting, "more run")} waiting.` : "";
  if (running) return `${sentenceCase(running.doing)} now.${behind}`;
  if (waiting > 0) return `${count(waiting, "run")} waiting to start.`;
  return "Nothing is running.";
}

/** How the last few finished runs went: all worked, some didn't finish, or some were stopped. */
function lastRuns(finished: readonly VerdictRun[]): string {
  if (finished.length === 0) return "No runs yet: start one with the buttons below.";
  const failed = finished.filter((run) => run.status === "failed").length;
  const n = finished.length;
  const last = n === 1 ? "the last run" : `the last ${n} runs`;
  if (failed > 0) {
    return n === 1 ? "The last run didn't finish." : `${failed} of ${last} didn't finish.`;
  }
  if (finished.every((run) => run.status === "ok")) {
    return `${sentenceCase(last)} worked.`;
  }
  return `${sentenceCase(last)} finished or were stopped.`;
}

/** The Agents page's verdict, from its runs newest first. */
export function agentsVerdict(runs: readonly VerdictRun[]): PageVerdict {
  const active = runs.some((run) => run.status === "running" || run.status === "queued");
  const finished = runs
    .filter((run) => run.status === "ok" || run.status === "failed" || run.status === "cancelled")
    .slice(0, RECENT_RUNS);
  const failed = finished.some((run) => run.status === "failed");
  const tone = failed ? "watch" : active ? "busy" : "ok";
  return { tone, text: sentences(runningNow(runs), lastRuns(finished)) };
}
