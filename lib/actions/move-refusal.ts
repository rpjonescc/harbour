/** Why a board move was refused. */
export type MoveRefusal =
  | "not_found"
  | "stale"
  | "same_column"
  | "has_pull_request"
  | "note_required"
  | "not_allowed";

/**
 * A plain sentence for each refusal, shown where the card snaps back. Here rather than in
 * lib/explain/board.ts so the move logic needs nothing from the wording layer, which re-exports it.
 */
export const MOVE_REFUSAL: Record<MoveRefusal, string> = {
  not_found: "This card is gone from the board. Refresh the page to see what is there now.",
  stale: "This card was moved a moment ago. The board shows where it is now. Try again from there.",
  same_column: "The card is already in that column, so nothing changed.",
  has_pull_request: "This card has a pull request, so it counts as In review.",
  note_required: "Claude has to say why it moved a card. Add a note and move it again.",
  // The board's Move to… menu leaves Done out for a new idea, and its card has an Accept button.
  not_allowed: "A new idea can't go straight to Done. Accept it first, or move it to Queue.",
};
