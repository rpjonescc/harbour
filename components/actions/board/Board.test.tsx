// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import { BOARD_COLUMNS } from "@/lib/actions/board-column";
import type { Board as BoardData } from "@/lib/actions/board-view";
import { BOARD_TEXT, COLUMN_COPY, PARKED_COPY } from "@/lib/explain/board";
import { BOARD_NOW, BOARD_PRODUCT, boardCard, boardOf } from "@/tests/helpers/board-cards";
import { Board } from "./Board";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

function renderBoard(board: BoardData, demo = false, focused = false) {
  return render(
    <Board
      board={board}
      focused={focused}
      products={[BOARD_PRODUCT]}
      now={BOARD_NOW}
      locale="en-GB"
      today="2026-10-02"
      demo={demo}
    />,
  );
}

describe("Board", () => {
  afterEach(() => vi.resetAllMocks());

  it("shows all six columns in order as named regions with their counts and one-liners", () => {
    const board = boardOf([boardCard({ id: 1 }), boardCard({ id: 2, title: "Second job" })]);
    renderBoard({ ...board, counts: { ...board.counts, done: 12 } });
    const regions = BOARD_COLUMNS.map((column) =>
      screen.getByRole("region", {
        name: BOARD_TEXT.columnLabel(column, column === "queue" ? 2 : column === "done" ? 12 : 0),
      }),
    );
    expect(regions).toHaveLength(6);
    expect(screen.getByRole("region", { name: "Queue, 2 cards" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Done, 12 cards" })).toBeInTheDocument();
    for (const column of BOARD_COLUMNS) {
      const region = screen.getByRole("region", {
        name: new RegExp(`^${COLUMN_COPY[column].name},`),
      });
      expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
        COLUMN_COPY[column].name,
      );
      expect(within(region).getByText(COLUMN_COPY[column].short)).toBeVisible();
      expect(
        within(region).getByRole("button", { name: `What's this? (${COLUMN_COPY[column].name})` }),
      ).toBeInTheDocument();
    }
  });

  it("opens a column's explainer with its four parts", () => {
    renderBoard(boardOf([]));
    const region = screen.getByRole("region", { name: "In review, 0 cards" });
    fireEvent.click(within(region).getByRole("button", { name: "What's this? (In review)" }));
    const { explainer } = COLUMN_COPY.in_review;
    for (const text of [explainer.what, explainer.whoMoves, explainer.next, explainer.ifStuck]) {
      expect(within(region).getByText(text)).toBeVisible();
    }
    expect(within(region).getByText("Who moves cards here")).toBeVisible();
  });

  it("says when a column is empty and lists cards inside their column", () => {
    renderBoard(boardOf([boardCard({ id: 4, column: "started", status: "in_progress" })]));
    const started = screen.getByRole("region", { name: "Started, 1 card" });
    expect(within(started).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Add a title to the pricing page",
    );
    const backlog = screen.getByRole("region", { name: "Backlog, 0 cards" });
    expect(within(backlog).getByText(BOARD_TEXT.emptyColumn)).toBeInTheDocument();
  });

  it("says in plain words when the card cap cut some cards off", () => {
    renderBoard(boardOf([boardCard()], { truncated: true }));
    expect(screen.getByText(BOARD_TEXT.truncated(200))).toBeInTheDocument();
  });

  it("does not mention a cap when every card fits", () => {
    renderBoard(boardOf([boardCard()]));
    expect(screen.queryByText(/at most/)).toBeNull();
  });

  it("lists parked cards with the existing bring-back controls", () => {
    renderBoard(
      boardOf([
        boardCard({
          id: 7,
          title: "Snoozed job",
          column: null,
          who: null,
          status: "snoozed",
          snoozedUntil: "2026-10-20",
        }),
        boardCard({ id: 8, title: "Dismissed job", column: null, who: null, status: "dismissed" }),
      ]),
    );
    const parked = screen.getByRole("region", { name: PARKED_COPY.name });
    expect(within(parked).getByText("Snoozed until 20 Oct 2026")).toBeInTheDocument();
    expect(
      within(parked).getByRole("button", { name: "Bring back now: Snoozed job" }),
    ).toBeInTheDocument();
    expect(
      within(parked).getByRole("button", { name: "Restore to Backlog: Dismissed job" }),
    ).toBeInTheDocument();
    expect(within(parked).queryByRole("button", { name: /Move to/ })).toBeNull();
  });

  it("says when nothing is parked", () => {
    renderBoard(boardOf([]));
    expect(screen.getByText(PARKED_COPY.empty)).toBeInTheDocument();
  });

  it("sends nothing in demo mode, from the move menu or the parked controls", () => {
    renderBoard(
      boardOf([
        boardCard({ id: 1 }),
        boardCard({ id: 9, title: "Snoozed job", column: null, status: "snoozed" }),
      ]),
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Move to… Add a title to the pricing page" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Done" }));
    expect(screen.getByRole("status")).toHaveTextContent(DEMO_NOTE);
    fireEvent.click(screen.getByRole("button", { name: "Bring back now: Snoozed job" }));
    expect(api.postJson).not.toHaveBeenCalled();
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Queue, 1 card" })).toBeInTheDocument();
  });

  it("while focused, counts the cards it shows and leaves the Parked strip out", () => {
    const board = boardOf([
      boardCard({ id: 1, stuck: true }),
      boardCard({ id: 3, column: null, status: "snoozed", snoozedUntil: "2026-10-20" }),
    ]);
    renderBoard({ ...board, counts: { ...board.counts, queue: 12 } }, false, true);
    expect(screen.getByRole("region", { name: "Queue, 1 card" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: PARKED_COPY.name })).toBeNull();
  });
});
