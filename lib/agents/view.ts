import type { Job } from "@/lib/jobs/queue";
import { describeStamp, isNoteStamp } from "@/lib/note/stamp";
import { RESEARCH_TOPICS } from "./topics";

/** What a job label needs of a product or content project: its id and name. */
export type Named = { id: string; name: string };

// A Map: a gate param of "constructor" must not find an inherited property.
const GATE_LABEL = new Map([
  ["no-ai-slop", "no-ai-slop"],
  ["humanizer", "humanizer"],
  ["facts", "facts and platform"],
]);

/** "acme-docs-20261002-five-minutes" becomes "five minutes". */
function ideaWords(ideaId: string | undefined): string {
  return (ideaId ?? "").replace(/^[a-z0-9-]+?-\d{8}-/, "").replaceAll("-", " ");
}

function contentJobLabel(job: Pick<Job, "kind" | "params">, products: readonly Named[]): string {
  const { params } = job;
  const words = ideaWords(params.ideaId);
  if (job.kind === "content-digest") return `Activity digest: ${params.day ?? ""}`;
  if (job.kind === "content-ideas") {
    return `Ideas: ${products.find((p) => p.id === params.productId)?.name ?? params.productId ?? ""}`;
  }
  if (job.kind === "content-draft") return `Writing: ${words}`;
  if (job.kind === "content-atomise") return `Atomising: ${words}`;
  if (job.kind === "content-gate") {
    return `Check (${GATE_LABEL.get(params.gate ?? "") ?? "unknown"}): ${words}`;
  }
  if (job.kind === "content-decision") return "Saving your decision";
  return "Content work";
}

/** Human label for a job, e.g. "Research: Glossary" or "Update: Glossary". */
export function jobLabel(job: Pick<Job, "kind" | "params">, products: readonly Named[]): string {
  if (job.kind === "research") {
    const topic = job.params.topic ?? "";
    const title = RESEARCH_TOPICS.find((t) => t.id === topic)?.title ?? topic;
    return `${job.params.mode === "refresh" ? "Update" : "Research"}: ${title}`;
  }
  if (job.kind === "discovery" || job.kind === "scan") {
    const id = job.params.productId ?? "";
    const name = products.find((p) => p.id === id)?.name ?? id;
    return `${job.kind === "scan" ? "Check" : "Find ideas"}: ${name}`;
  }
  if (job.kind === "weekly-analyst") return `Weekly report: ${job.params.week ?? ""}`;
  if (job.kind === "daily-note") {
    const stamp = job.params.stamp ?? "";
    return `Daily note: ${isNoteStamp(stamp) ? describeStamp(stamp) : stamp}`;
  }
  if (job.kind.startsWith("content-")) return contentJobLabel(job, products);
  if (job.kind === "backup") return `Nightly backup: ${job.params.day ?? ""}`;
  if (job.kind === "retention") return `Tidy old data: ${job.params.day ?? ""}`;
  if (job.kind === "notes-sync") return "Save notes to GitHub";
  return "Sync Second Brain to GitHub";
}

/** Compact duration, e.g. "45s", "3m 05s"; "—" when not both ends are known. */
export function formatDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Whether a job may still change (polling and the Cancel button apply). */
export function isActive(status: string): boolean {
  return status === "queued" || status === "running";
}
