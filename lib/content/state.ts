export const PIECE_STATES = ["drafting", "ready", "needs-you", "approved", "discarded"] as const;
export type PieceState = (typeof PIECE_STATES)[number];
export const IDEA_STATES = ["idea", "drafting", "drafted", "discarded"] as const;
export type IdeaState = (typeof IDEA_STATES)[number];
export type PieceAction = "finish" | "edit" | "approve" | "discard";

/**
 * The piece state after `action`, or null when the spec's transitions forbid it. `outcome` is
 * what the checks decided for "finish" and "edit". A piece still being written (or stuck after
 * a failed step) may be discarded: otherwise a failed chain could never be cleared.
 */
export function transition(
  from: PieceState,
  action: PieceAction,
  outcome: "ready" | "needs-you" = "ready",
): PieceState | null {
  // Runtime guard: callers may pass values that were only typed, not checked.
  if (outcome !== "ready" && outcome !== "needs-you") return null;
  const open = from === "ready" || from === "needs-you";
  if (action === "finish") return from === "drafting" ? outcome : null;
  if (action === "edit") return open ? outcome : null;
  if (action === "approve") return open ? "approved" : null;
  if (action === "discard") return from === "discarded" ? null : "discarded";
  return null;
}

/** The stale-state guard: the file must still be at the revision the owner was looking at. */
export function revisionMatches(file: number, given: number): boolean {
  return file === given;
}
