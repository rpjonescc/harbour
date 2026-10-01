/** Where the board was when the owner changed a card: its id, its group and the card order. */
export type ChangeSnapshot = { id: number; impact: string; order: number[] };

export const BOARD_HEADING_ID = "actions-heading";
export const cardTitleId = (id: number) => `action-${id}-title`;
export const impactHeadingId = (impact: string) => `impact-${impact}`;

/** The cards on the board in DOM order (`data-action-id`), and the changed card's group. */
export function snapshotBoard(id: number): ChangeSnapshot {
  const cards = [...document.querySelectorAll<HTMLElement>("[data-action-id]")];
  const order = cards.map((card) => Number(card.dataset.actionId));
  const impact = cards.find((card) => card.dataset.actionId === String(id))?.dataset.impact ?? "";
  return { id, impact, order };
}

/**
 * Element ids to focus after the board refreshes, best first: the card itself, the cards after
 * it, the cards before it (nearest first), its impact group, then the board heading.
 */
export function focusCandidates({ id, impact, order }: ChangeSnapshot): string[] {
  const at = order.indexOf(id);
  const after = at < 0 ? [] : order.slice(at + 1);
  const before = at < 0 ? [] : order.slice(0, at).reverse();
  return [
    cardTitleId(id),
    ...after.map(cardTitleId),
    ...before.map(cardTitleId),
    impactHeadingId(impact),
    BOARD_HEADING_ID,
  ];
}

/** Focuses the first candidate that is still on the page. */
export function focusFirst(ids: string[]): void {
  const element = ids.map((id) => document.getElementById(id)).find((el) => el !== null);
  element?.focus();
}
