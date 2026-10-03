// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { BoardColumnId } from "@/lib/actions/board-column";
import { BOARD_NOW, boardCard, boardOf } from "@/tests/helpers/board-cards";
import { ActionAnnouncer } from "../ActionAnnouncer";
import { type BoardCardView, toCardView } from "./card-view";
import { useBoardMoves } from "./useBoardMoves";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const HUES = new Map([["acme-docs", "teal" as const]]);

/** The board's columns as the server would send them, with card 5 and 6 where given. */
function columnsWith(five: BoardColumnId, six: BoardColumnId) {
  const board = boardOf([
    boardCard({ id: 5, title: "Five", column: five }),
    boardCard({ id: 6, title: "Six", column: six }),
  ]);
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([id, cards]) => [
      id,
      cards.flatMap((card) => toCardView(card, HUES, BOARD_NOW) ?? []),
    ]),
  ) as Record<BoardColumnId, BoardCardView[]>;
  return { columns, counts: board.counts };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ActionAnnouncer>{children}</ActionAnnouncer>
);

describe("useBoardMoves", () => {
  afterEach(() => vi.resetAllMocks());

  it("keeps a second move in place when the first move's refresh lands first", async () => {
    const replies: ((value: unknown) => void)[] = [];
    api.postJson.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
    const first = columnsWith("queue", "queue");
    const hook = renderHook((props) => useBoardMoves({ ...props, demo: false }), {
      initialProps: first,
      wrapper,
    });
    const card = (id: number) => first.columns.queue.find((c) => c.id === id) as BoardCardView;
    let moves: Promise<void>[] = [];
    act(() => {
      moves = [
        hook.result.current.move(card(5), "started"),
        hook.result.current.move(card(6), "done"),
      ];
    });
    await act(async () => {
      replies[0]?.({ ok: true, data: { id: 5, column: "started" } });
      await moves[0];
    });
    // The refresh for card 5 arrives while card 6's move is still waiting for the server.
    hook.rerender(columnsWith("started", "queue"));
    const ids = (column: BoardColumnId) => hook.result.current.placed[column].map((c) => c.id);
    expect(ids("started")).toEqual([5]);
    expect(ids("done")).toEqual([6]);
    expect(ids("queue")).toEqual([]);
    await act(async () => {
      replies[1]?.({ ok: true, data: { id: 6, column: "done" } });
      await moves[1];
    });
    hook.rerender(columnsWith("started", "done"));
    expect(ids("done")).toEqual([6]);
  });
});
