import { BOARD_NOW, boardCard } from "@/tests/helpers/board-cards";
import { type BoardCardView, placeCards, shiftCounts, toCardView } from "./card-view";

const HUES = new Map([["acme-docs", "teal" as const]]);

function view(over: Parameters<typeof boardCard>[0] = {}): BoardCardView {
  const card = toCardView(boardCard(over), HUES, BOARD_NOW);
  if (!card) throw new Error("fixture product missing");
  return card;
}

const empty = () => ({
  backlog: [] as BoardCardView[],
  queue: [] as BoardCardView[],
  started: [] as BoardCardView[],
  in_progress: [] as BoardCardView[],
  in_review: [] as BoardCardView[],
  done: [] as BoardCardView[],
});

describe("toCardView", () => {
  it("words the last move on the server clock and attaches the product colour", () => {
    const card = view();
    expect(card.lastMoveText).toBe("You moved this to Queue, yesterday");
    expect(card.hue).toBe("teal");
    expect(card).not.toHaveProperty("lastMove");
  });

  it("has no last-move line when the history is gone", () => {
    expect(view({ lastMove: null }).lastMoveText).toBeNull();
  });

  it("skips a card whose product is not configured", () => {
    expect(toCardView(boardCard({ productId: "gone" }), HUES, BOARD_NOW)).toBeNull();
  });
});

describe("placeCards and shiftCounts", () => {
  const a = view({ id: 1 });
  const b = view({ id: 2 });
  const c = view({ id: 3, column: "done", status: "done" });
  const columns = { ...empty(), queue: [a, b], done: [c] };
  const counts = { backlog: 0, queue: 5, started: 0, in_progress: 0, in_review: 0, done: 9 };

  it("leaves cards where the server put them with no pending move", () => {
    expect(placeCards(columns, {}).queue).toEqual([a, b]);
    expect(shiftCounts(counts, columns, {})).toEqual(counts);
  });

  it("puts a moved card at the top of its new column and shifts the counts", () => {
    const placed = placeCards(columns, { 2: "done" });
    expect(placed.queue).toEqual([a]);
    expect(placed.done).toEqual([b, c]);
    expect(shiftCounts(counts, columns, { 2: "done" })).toMatchObject({ queue: 4, done: 10 });
  });

  it("counts a move back to the card's own column as no move", () => {
    expect(shiftCounts(counts, columns, { 1: "queue" })).toEqual(counts);
  });
});
