/** "3 research targets waiting for your OK": shared by Settings and the Actions board's note. */
export function approvalsPhrase(count: number): string {
  return `${count} research ${count === 1 ? "target" : "targets"} waiting for your OK`;
}

/** Said when approving would pass six content pillars: what happened, why, what to do. */
export const PILLAR_LIMIT_MESSAGE =
  "You already have six approved content pillars, which is the most Harbour keeps. Reject one you no longer want, then approve this one.";

/** The plain reason for a failed approval request, or the caller's generic line. */
export function approvalFailure(code: string, fallback: string): string {
  return code === "pillar_limit" ? PILLAR_LIMIT_MESSAGE : fallback;
}
