import { BOARD_HEADING_ID, focusCandidates } from "./focus-after-change";

describe("focusCandidates", () => {
  it("tries the card, the next cards, the previous cards, its group, then the board", () => {
    expect(focusCandidates({ id: 2, group: "impact-high", order: [1, 2, 3, 4] })).toEqual([
      "action-2-title",
      "action-3-title",
      "action-4-title",
      "action-1-title",
      "impact-high",
      BOARD_HEADING_ID,
    ]);
  });

  it("falls back to the group and the board when the card was the only one", () => {
    expect(focusCandidates({ id: 9, group: "impact-low", order: [9] })).toEqual([
      "action-9-title",
      "impact-low",
      "actions-heading",
    ]);
  });
});
