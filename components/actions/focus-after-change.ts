/**
 * Where the page was when the owner changed a card: its id, the id of its group's heading (an
 * impact group on the list, a column on the board) and the card order.
 */
export type ChangeSnapshot = { id: number; group: string; order: number[] };

export const BOARD_HEADING_ID = "actions-heading";
export const cardTitleId = (id: number) => `action-${id}-title`;
export const impactHeadingId = (impact: string) => `impact-${impact}`;
export const columnHeadingId = (column: string) => `column-${column}`;
export const PARKED_HEADING_ID = "parked-heading";

/** The cards in DOM order (`data-action-id`), and the changed card's `data-group-heading`. */
export function snapshotBoard(id: number): ChangeSnapshot {
  const cards = [...document.querySelectorAll<HTMLElement>("[data-action-id]")];
  const order = cards.map((card) => Number(card.dataset.actionId));
  const group =
    cards.find((card) => card.dataset.actionId === String(id))?.dataset.groupHeading ?? "";
  return { id, group, order };
}

/**
 * Element ids to focus after the board refreshes, best first: the card itself, the cards after
 * it, the cards before it (nearest first), its group's heading, then the page heading.
 */
export function focusCandidates({ id, group, order }: ChangeSnapshot): string[] {
  const at = order.indexOf(id);
  const after = at < 0 ? [] : order.slice(at + 1);
  const before = at < 0 ? [] : order.slice(0, at).reverse();
  return [
    cardTitleId(id),
    ...after.map(cardTitleId),
    ...before.map(cardTitleId),
    ...(group ? [group] : []),
    BOARD_HEADING_ID,
  ];
}

/** Focuses the first candidate that is still on the page. */
export function focusFirst(ids: string[]): void {
  const element = ids.map((id) => document.getElementById(id)).find((el) => el !== null);
  element?.focus();
}
