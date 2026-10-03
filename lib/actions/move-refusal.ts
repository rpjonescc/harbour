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
  not_found: "This card is not on the board any more. Refresh the page to see the board as it is.",
  stale: "This card moved already. The board now shows where it is, so try again from there.",
  same_column: "The card is already in that column.",
  has_pull_request: "This card has a pull request, so it counts as In review.",
  note_required: "Claude has to say why it moved a card. Add a note and move it again.",
  not_allowed:
    "A new idea has to be accepted before it can be done. Move it to Backlog or Queue first.",
};
