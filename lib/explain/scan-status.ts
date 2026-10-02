/** What the Product page says about scanning, in the owner's words (spec §5.5). */
export const NEVER_SCANNED =
  "Harbour hasn't checked this site yet; choose Check now and the scores appear when it finishes.";

const WHEN_DONE = "this page updates when it finishes";

/** A scan that is queued or running. `started` is the formatted start time. */
export function activeScanSentence(status: "queued" | "running", started: string): string {
  return status === "running"
    ? `Checking now (started ${started}); ${WHEN_DONE}.`
    : `A check is waiting to start; ${WHEN_DONE}.`;
}

/**
 * How the last scan ended. `showing` is when the scores on screen come from (a failed scan
 * never hides the last good results); null when there are none. While a scan is `active` the
 * Check now button is disabled, so the sentence leaves out "Try Check now."
 */
export function lastScanSentence(input: {
  status: "ok" | "partial" | "failed";
  when: string;
  showing: string | null;
  active?: boolean;
}): string {
  const { status, when, showing, active = false } = input;
  const retry = active ? "" : " Try Check now.";
  if (status === "ok") return `Last check ${when}.`;
  if (status === "partial") {
    return `Last check ${when} had a data source problem, so some scores may be missing.${retry}`;
  }
  if (showing === null) return `The last check didn't finish and there are no results yet.${retry}`;
  return `The last check didn't finish, so you're seeing the ${showing} results.${retry}`;
}

/** What Check now says back: what happened, and what to do when it didn't work. */
export const SCAN_NOW = {
  queued: "Check queued. It starts shortly.",
  already: "A check is already waiting to run.",
  failed: "Harbour couldn't start the check. Try again in a moment.",
} as const;
