// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { addAction } from "@/lib/actions/cli/add";
import { boardActions } from "@/lib/actions/views";
import type { Product } from "@/lib/products/catalog";
import { openTestDb } from "@/tests/helpers/db";
import { ActionCard } from "./ActionCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const PRODUCT: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
  kind: "product" as const,
};

describe("ActionCard for an action added by hand", () => {
  it("renders from the real board read model, with its source and linked evidence", () => {
    const db = openTestDb();
    const now = new Date("2026-10-02T09:00:00Z");
    addAction(
      db,
      {
        productId: "acme-docs",
        status: "open",
        stage: null,
        title: "Hand the page titles to the docs owner",
        why: "The owner session needs a tracked item for this hand-off.",
        fix: null,
        check: null,
        area: "SEO",
        impact: "high",
        effort: "small",
        evidence: ["Seen on /a"],
        docs: ["https://example.com/guide"],
      },
      now,
    );
    const filter = { productId: null, area: null, status: "active" } as const;
    const [action] = boardActions(db, filter, ["acme-docs"]).groups.flatMap((g) => g.actions);
    if (!action) throw new Error("the board has no action");
    render(
      <ActionCard
        action={action}
        product={PRODUCT}
        locale="en-GB"
        timeZone="Europe/London"
        today="2026-10-02"
      />,
    );
    const card = screen.getByRole("article", { name: action.title });
    expect(within(card).getByText("Added by hand by Claude")).toBeInTheDocument();
    expect(within(card).getByText("Seen on /a")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /example\.com\/guide/ })).toHaveAttribute(
      "href",
      "https://example.com/guide",
    );
    expect(within(card).queryByText("Rule")).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /^Start:/ })).toBeInTheDocument();
  });
});
