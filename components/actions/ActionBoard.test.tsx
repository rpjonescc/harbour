// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { exampleActionView } from "@/components/design/action-example-data";
import type { ActionGroup } from "@/lib/actions/views";
import type { Product } from "@/lib/products/catalog";
import { ActionBoard } from "./ActionBoard";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const PRODUCT: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
  kind: "product" as const,
};
const card = (id: number, impact: "high" | "medium" = "high") =>
  exampleActionView({ id, impact, title: `Action ${id}` });

function board(groups: ActionGroup[]) {
  return (
    <>
      <h1 id="actions-heading" tabIndex={-1}>
        Actions
      </h1>
      <ActionBoard
        groups={groups}
        more={0}
        filter={{ productId: null, area: null, status: "active" }}
        products={[PRODUCT]}
        locale="en-GB"
        timeZone="Europe/London"
        today="2026-10-02"
      />
    </>
  );
}

describe("ActionBoard focus after a status change", () => {
  afterEach(() => vi.resetAllMocks());

  it("moves focus to the next card's heading when the changed card leaves", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { id: 2, status: "done" } });
    const { rerender } = render(board([{ impact: "high", actions: [card(1), card(2), card(3)] }]));
    nav.refresh.mockImplementation(() =>
      rerender(board([{ impact: "high", actions: [card(1), card(3)] }])),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Action 2" }));
    await vi.waitFor(() => expect(document.activeElement?.id).toBe("action-3-title"));
    expect(screen.getByText("Marked done: Action 2")).toHaveAttribute("role", "status");
  });

  it("falls back to the board heading when nothing else is left", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { id: 5, status: "done" } });
    const { rerender } = render(board([{ impact: "medium", actions: [card(5, "medium")] }]));
    nav.refresh.mockImplementation(() => rerender(board([])));
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Action 5" }));
    await vi.waitFor(() => expect(document.activeElement?.id).toBe("actions-heading"));
  });

  it("keeps a 409 message on the board after the card is gone", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "stale" });
    const { rerender } = render(board([{ impact: "high", actions: [card(1), card(2)] }]));
    nav.refresh.mockImplementation(() => rerender(board([{ impact: "high", actions: [card(1)] }])));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Action 2" }));
    await vi.waitFor(() => expect(document.activeElement?.id).toBe("action-1-title"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This card changed since you opened it, so Harbour refreshed the board. Check it and try again.",
    );
  });
});
