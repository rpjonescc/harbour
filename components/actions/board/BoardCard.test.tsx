// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { BoardColumnId } from "@/lib/actions/board-column";
import type { BoardCard as BoardCardData } from "@/lib/actions/board-view";
import { BOARD_TEXT, COLUMN_COPY } from "@/lib/explain/board";
import { BOARD_NOW, boardCard } from "@/tests/helpers/board-cards";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
import { BoardCard } from "./BoardCard";
import { toCardView } from "./card-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth/client-api", () => ({ postJson: vi.fn() }));

const PR = "https://github.com/example/docs/pull/42";
const noDrag = { draggable: true as const, onDragStart: vi.fn(), onDragEnd: vi.fn() };

function renderCard(over: Partial<BoardCardData> = {}, column?: BoardColumnId) {
  const view = toCardView(boardCard(over), new Map([["acme-docs", "teal"]]), BOARD_NOW);
  if (!view) throw new Error("fixture product missing");
  const result = render(
    <BoardCard
      card={view}
      column={column ?? view.column ?? "backlog"}
      arrived={false}
      drag={noDrag}
      onMove={vi.fn()}
      today="2026-10-02"
      demo
    />,
  );
  return result.container.querySelector("article") as HTMLElement;
}

describe("BoardCard", () => {
  it("shows what, why, the project, who is on it, waiting on, what next and the last move", () => {
    const card = renderCard();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Add a title to the pricing page",
    );
    expect(screen.getByText("Search results show the address instead of a name.")).toBeVisible();
    expect(screen.getByText("Acme Docs")).toBeVisible();
    expect(screen.getByText("· Waiting for you")).toBeVisible();
    expect(screen.getByText(COLUMN_COPY.queue.waitingOn(boardCard()))).toBeVisible();
    expect(screen.getByText(COLUMN_COPY.queue.whatNext(boardCard()))).toBeVisible();
    expect(screen.getByText("You moved this to Queue, yesterday")).toBeVisible();
    expect(card).toHaveAttribute("aria-labelledby", "action-1-title");
    expect(card).toHaveAttribute("data-group-heading", "column-queue");
    expect(card).toHaveAttribute("draggable", "true");
  });

  it("links the pull request and words In review for it", () => {
    renderCard({ column: "in_review", status: "in_progress", prUrl: PR, who: "pr_waiting" });
    expect(screen.getByRole("link", { name: /Pull request/ })).toHaveAttribute("href", PR);
    expect(screen.getByText("Waiting for your OK on the pull request.")).toBeVisible();
  });

  it("tags a new idea and offers accept or dismiss", () => {
    renderCard({ column: "backlog", status: "suggested", isNewIdea: true, who: "undecided" });
    expect(screen.getByText(BOARD_TEXT.newIdea)).toBeVisible();
    expect(screen.getByRole("button", { name: /^Accept: / })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Dismiss: / })).toBeInTheDocument();
    expect(screen.getByText("Waiting for you to accept or dismiss it.")).toBeVisible();
    // The tag already says it: no second "new idea" line.
    expect(screen.queryByText(/not decided yet/)).toBeNull();
  });

  it("offers no accept or dismiss on a card that is already decided", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: /^Accept: / })).toBeNull();
  });

  it("says a stuck card is stuck, in words and not colour alone", () => {
    renderCard({ column: "started", status: "in_progress", stuck: true });
    expect(screen.getByText(BOARD_TEXT.stuck)).toBeVisible();
    expect(screen.getByText("Nothing has changed for more than 7 days.")).toBeVisible();
  });

  it("drops the stuck wording once the card has moved to another column", () => {
    renderCard({ column: "started", status: "in_progress", stuck: true }, "queue");
    expect(screen.queryByText(BOARD_TEXT.stuck)).toBeNull();
  });

  it("keeps stored codes inside Technical details only", () => {
    const card = renderCard({ column: "in_progress", status: "in_progress" });
    const face = textOutsideDetails(card);
    for (const code of ["in_progress", "open", "queue"]) expect(face).not.toContain(code);
    expect(card.querySelector("details")).toHaveTextContent("in_progress");
  });

  it("has a Move to… button named for the card, big enough to touch", () => {
    renderCard();
    const button = screen.getByRole("button", { name: "Move to… Add a title to the pricing page" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button.className).toContain("min-h-11");
  });
});
