import type { LatestRun } from "@/lib/note/view";

/**
 * How the wait for a fresh note ends, or null while it should go on. `since` is the stamp of the
 * note on show when the owner asked. The run says more than the note can: a note re-written in
 * the same minute has the same stamp, and a run the checker rejected writes no note at all.
 */
export function endOfWait(
  wait: { jobId: number; since: string | null },
  latestAt: string | null,
  latestRun: LatestRun | null,
): "done" | "failed" | null {
  if (latestRun && latestRun.id >= wait.jobId) {
    if (latestRun.status === "failed") return "failed";
    // Done (or cancelled by the owner), or a later run has taken over from this one.
    if (latestRun.status !== "queued" && latestRun.status !== "running") return "done";
    if (latestRun.id > wait.jobId) return "done";
  }
  return latestAt !== wait.since ? "done" : null;
}
