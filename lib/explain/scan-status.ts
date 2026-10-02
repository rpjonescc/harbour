/** What the Product page says about scanning, in the owner's words (spec §5.5). */
export const NEVER_SCANNED =
  "Harbour hasn't scanned this site yet; choose Scan now and the scores appear when it finishes.";

const WHEN_DONE = "this page updates when it finishes";

/** A scan that is queued or running. `started` is the formatted start time. */
export function activeScanSentence(status: "queued" | "running", started: string): string {
  return status === "running"
    ? `Scanning now (started ${started}); ${WHEN_DONE}.`
    : `A scan is waiting to start; ${WHEN_DONE}.`;
}

/**
 * How the last scan ended. `showing` is when the scores on screen come from (a failed scan
 * never hides the last good results); null when there are none. While a scan is `active` the
 * Scan now button is disabled, so the sentence leaves out "Try Scan now."
 */
export function lastScanSentence(input: {
  status: "ok" | "partial" | "failed";
  when: string;
  showing: string | null;
  active?: boolean;
}): string {
  const { status, when, showing, active = false } = input;
  const retry = active ? "" : " Try Scan now.";
  if (status === "ok") return `Last scan ${when}.`;
  if (status === "partial") {
    return `Last scan ${when} had a data source problem, so some scores may be missing.${retry}`;
  }
  if (showing === null) return `The last scan didn't finish and there are no results yet.${retry}`;
  return `The last scan didn't finish, so you're seeing the ${showing} results.${retry}`;
}

/** What Scan now says back: what happened, and what to do when it didn't work. */
export const SCAN_NOW = {
  queued: "Scan queued. It starts shortly.",
  already: "A scan is already waiting to run.",
  failed: "Harbour couldn't start the scan. Try again in a moment.",
} as const;
