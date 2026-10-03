// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MOVE_REFUSAL } from "@/lib/explain/board";
import { BOARD_NOW, boardCard, boardOf } from "@/tests/helpers/board-cards";
import { ActionAnnouncer } from "../ActionAnnouncer";
import { BoardLanes } from "./BoardLanes";
import { type BoardCardView, toCardView } from "./card-view";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const TITLE = "Add a title to the pricing page";
const HUES = new Map([["acme-docs", "teal" as const]]);

function renderLanes() {
  const board = boardOf([boardCard({ id: 5 }), boardCard({ id: 6, title: "Other job" })]);
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([id, cards]) => [
      id,
      cards.flatMap((card) => toCardView(card, HUES, BOARD_NOW) ?? []),
    ]),
  ) as Record<keyof typeof board.columns, BoardCardView[]>;
  return render(
    <ActionAnnouncer>
      <BoardLanes columns={columns} counts={board.counts} today="2026-10-02" demo={false} />
    </ActionAnnouncer>,
  );
}

const region = (name: string) => screen.getByRole("region", { name });
const cardOf = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("article") as HTMLElement;
const zoneOf = (name: string) => within(region(name)).getByRole("list");

function dataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

function drag(title: string, to: string) {
  const transfer = dataTransfer();
  fireEvent.dragStart(cardOf(title), { dataTransfer: transfer });
  fireEvent.dragOver(zoneOf(to), { dataTransfer: transfer });
  return { transfer, drop: () => fireEvent.drop(zoneOf(to), { dataTransfer: transfer }) };
}

describe("BoardLanes moves", () => {
  afterEach(() => vi.resetAllMocks());

  it("shows the drop zone's hover state while a card is dragged over it", () => {
    renderLanes();
    drag(TITLE, "Done, 0 cards");
    expect(zoneOf("Done, 0 cards")).toHaveAttribute("data-over", "true");
    fireEvent.dragEnd(cardOf(TITLE));
    expect(zoneOf("Done, 0 cards")).not.toHaveAttribute("data-over");
  });

  it("posts the move on drop, places the card at once and announces it", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { id: 5, column: "done" } });
    renderLanes();
    const { drop } = drag(TITLE, "Done, 0 cards");
    await act(async () => {
      drop();
    });
    expect(api.postJson).toHaveBeenCalledWith("/api/actions/5", {
      moveFrom: "queue",
      moveTo: "done",
    });
    expect(within(region("Done, 1 card")).getByText(TITLE)).toBeInTheDocument();
    expect(region("Queue, 1 card")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`Moved ${TITLE} to Done`);
    expect(nav.refresh).toHaveBeenCalled();
    expect(cardOf(TITLE)).toHaveClass("board-arrive");
    await waitFor(() => expect(screen.getByRole("heading", { name: TITLE })).toHaveFocus());
  });

  it("puts a refused card back and says why in the server's words", async () => {
    api.postJson.mockResolvedValue({
      ok: false,
      error: "stale",
      message: MOVE_REFUSAL.stale,
    });
    renderLanes();
    const { drop } = drag(TITLE, "Started, 0 cards");
    await act(async () => {
      drop();
    });
    expect(within(region("Queue, 2 cards")).getByText(TITLE)).toBeInTheDocument();
    expect(region("Started, 0 cards")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(MOVE_REFUSAL.stale);
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("falls back to a plain sentence when the server gave none", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "network_error" });
    renderLanes();
    const { drop } = drag(TITLE, "Started, 0 cards");
    await act(async () => {
      drop();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("That move wasn't saved.");
  });

  it("ignores a drop on the column the card is already in", async () => {
    renderLanes();
    const { drop } = drag(TITLE, "Queue, 2 cards");
    await act(async () => {
      drop();
    });
    expect(api.postJson).not.toHaveBeenCalled();
  });

  it("moves through the Move to… menu with the same request", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { id: 6, column: "in_review" } });
    renderLanes();
    fireEvent.click(screen.getByRole("button", { name: "Move to… Other job" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "In review" }));
    });
    expect(api.postJson).toHaveBeenCalledWith("/api/actions/6", {
      moveFrom: "queue",
      moveTo: "in_review",
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Other job" })).toHaveFocus());
  });
});
