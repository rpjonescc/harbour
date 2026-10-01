import type { EventKind, JobKind, JobStatus } from "@/lib/jobs/queue";

/** A job as sent to the browser (dates are ISO strings once serialised). */
export type RunJob = {
  id: number;
  kind: JobKind;
  status: JobStatus;
  error: string | null;
  label: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type RunEvent = { id: number; at: string; kind: EventKind; text: string };
