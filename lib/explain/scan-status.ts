/** What the Product page says about scanning, in the owner's words (spec §5.5). */
export const NEVER_SCANNED =
  "Harbour hasn't scanned this site yet. Choose Scan now to run the first scan; the scores appear when it finishes.";

const WHEN_DONE = "This page updates when it finishes.";

/** A scan that is queued or running. `started` is the formatted start time. */
export function activeScanSentence(status: "queued" | "running", started: string): string {
  return status === "running"
    ? `Scanning now (started ${started}). ${WHEN_DONE}`
    : `A scan is waiting to start. It begins as soon as Harbour is free. ${WHEN_DONE}`;
}

/**
 * How the last scan ended. `showing` is when the scores on screen come from (a failed scan
 * never hides the last good results); null when there are none.
 */
export function lastScanSentence(input: {
  status: "ok" | "partial" | "failed";
  when: string;
  showing: string | null;
}): string {
  const { status, when, showing } = input;
  if (status === "ok") return `Last scan ${when}.`;
  if (status === "partial") {
    return `Last scan ${when}. Some data sources had a problem, so some scores may be missing for now.`;
  }
  const seeing = showing
    ? `You're seeing the results of the scan from ${showing}.`
    : "There are no results yet.";
  return `The last scan didn't finish (${when}). ${seeing} Try Scan now again.`;
}

/** What Scan now says back: what happened, and what to do when it didn't work. */
export const SCAN_NOW = {
  queued: "Scan queued. It starts shortly.",
  already: "A scan is already waiting to run.",
  failed: "Harbour couldn't start the scan. Nothing changed, so try again in a moment.",
} as const;
