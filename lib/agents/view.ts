import type { Job } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { RESEARCH_TOPICS } from "./topics";

/** Human label for a job, e.g. "Research: Glossary". */
export function jobLabel(job: Pick<Job, "kind" | "params">, products: readonly Product[]): string {
  if (job.kind === "research") {
    const topic = job.params.topic ?? "";
    return `Research: ${RESEARCH_TOPICS.find((t) => t.id === topic)?.title ?? topic}`;
  }
  if (job.kind === "discovery" || job.kind === "scan") {
    const id = job.params.productId ?? "";
    const name = products.find((p) => p.id === id)?.name ?? id;
    return `${job.kind === "scan" ? "Scan" : "Discovery"}: ${name}`;
  }
  if (job.kind === "weekly-analyst") return `Weekly report: ${job.params.week ?? ""}`;
  if (job.kind === "backup") return `Nightly backup: ${job.params.day ?? ""}`;
  if (job.kind === "retention") return `Retention: ${job.params.day ?? ""}`;
  if (job.kind === "notes-sync") return "Save notes to GitHub";
  return "Sync brain to GitHub";
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
