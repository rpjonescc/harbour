// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("shows what, why, the project and one status line; next and the last move behind Details", () => {
    const card = renderCard();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Add a title to the pricing page",
    );
    const why = screen.getByText("Search results show the address instead of a name.");
    expect(why).toBeVisible();
    expect(why.className).toContain("line-clamp-2");
    expect(screen.getByText("Acme Docs")).toBeVisible();
    // One status line: who has it and what it waits on, said once.
    expect(screen.getByText(COLUMN_COPY.queue.waitingOn(boardCard()))).toBeVisible();
    expect(screen.queryByText("· Waiting for you")).toBeNull();
    const details = within(card).getByText(BOARD_TEXT.details).closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent(COLUMN_COPY.queue.whatNext(boardCard()));
    expect(details).toHaveTextContent("You moved this to Queue, yesterday");
    expect(details?.querySelector("details")).toHaveTextContent(BOARD_TEXT.technical.id);
    expect(card).toHaveAttribute("aria-labelledby", "action-1-title");
    expect(card).toHaveAttribute("data-group-heading", "column-queue");
    expect(card).toHaveAttribute("draggable", "true");
  });

  it("names the Details summary for its card and makes it big enough to touch", () => {
    const card = renderCard();
    const summary = card.querySelector("summary") as HTMLElement;
    expect(summary).toHaveTextContent(`${BOARD_TEXT.details} (Add a title to the pricing page)`);
    expect(summary.className).toContain("min-h-11");
  });

  it("links the pull request and words In review for it", () => {
    renderCard({ column: "in_review", status: "in_progress", prUrl: PR, who: "pr_waiting" });
    expect(screen.getByRole("link", { name: /Pull request/ })).toHaveAttribute("href", PR);
    expect(screen.getByText("Waiting for your OK on the pull request.")).toBeVisible();
  });

  it("tags a new idea and keeps accept and dismiss on the card's face", () => {
    renderCard({ column: "backlog", status: "suggested", isNewIdea: true, who: "undecided" });
    expect(screen.getByText(BOARD_TEXT.newIdea)).toBeVisible();
    for (const name of [/^Accept: /, /^Dismiss: /]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeVisible();
      expect(button.closest("details")).toBeNull();
    }
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
    expect(card.querySelector("details details")).toHaveTextContent("in_progress");
  });

  it("has a small icon Move to… button named for the card, big enough to touch", () => {
    renderCard();
    const button = screen.getByRole("button", { name: "Move to… Add a title to the pricing page" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("title", BOARD_TEXT.moveTo);
    expect(button.textContent).toBe("");
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("min-w-11");
  });

  it("remembers Technical details per card, so opening one leaves the others' faces plain", () => {
    localStorage.clear();
    const technical = (card: HTMLElement) => card.querySelector("details details");
    const first = technical(renderCard({ id: 1 })) as HTMLDetailsElement;
    // What a click on the summary does: the browser flips `open`, then fires "toggle".
    first.open = true;
    fireEvent(first, new Event("toggle"));
    const second = technical(renderCard({ id: 2, title: "Another job" }));
    expect(second).not.toHaveAttribute("open");
    localStorage.clear();
  });
});
