import type { CopyResult } from "./store";

/** The job event for a copy into the history: how many checks were kept and how many were dropped. */
export function describeCopy({
  written,
  dropped,
}: Pick<CopyResult, "written" | "dropped">): string {
  const kept = `Outside view: kept ${written} new ${written === 1 ? "check" : "checks"}`;
  if (dropped === 0) return kept;
  return `${kept}, ${dropped} failed their shape and ${dropped === 1 ? "was" : "were"} dropped`;
}
