// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { NEED_ITEMS } from "@/components/design/tower-example-data";
import { NOTHING_NEEDS_YOU, TILE_FAILED } from "@/lib/explain/tower";
import { NeedsYou } from "./NeedsYou";

const ok = (items = NEED_ITEMS, more = 0) => ({ ok: true as const, data: { items, more } });

describe("NeedsYou", () => {
  it("is an ordered list in priority order, each item with exactly one link named by its item", () => {
    render(<NeedsYou result={ok()} />);
    const section = screen.getByRole("region", { name: "Needs you" });
    expect(section).toHaveAttribute("id", "tower-needs");
    const list = within(section).getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const [i, li] of items.entries()) {
      const need = NEED_ITEMS[i];
      if (!need) throw new Error("missing item");
      expect(li).toHaveTextContent(need.sentence);
      const links = within(li).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName(need.button.name);
      expect(links[0]).toHaveTextContent(need.button.label);
      expect(links[0]).toHaveAttribute("href", need.button.href);
    }
    expect(
      screen.getByRole("link", { name: "Review: 2 cards on the Board are waiting for you" }),
    ).toBeVisible();
  });

  it("counts what is beyond the first five", () => {
    render(<NeedsYou result={ok(NEED_ITEMS, 2)} />);
    expect(screen.getByText(/2 more after these/)).toBeVisible();
    expect(screen.queryByRole("link", { name: /See the other/ })).toBeNull();
  });

  it("links the rest when they all wait in one place", () => {
    const href = "/actions?view=board&focus=needs-you";
    render(
      <NeedsYou result={{ ok: true, data: { items: NEED_ITEMS, more: 2, moreHref: href } }} />,
    );
    expect(screen.getByRole("link", { name: "See the other 2" })).toHaveAttribute("href", href);
  });

  it("makes the empty state a win, with no button", () => {
    render(<NeedsYou result={ok([], 0)} />);
    expect(screen.getByText(NOTHING_NEEDS_YOU)).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says it couldn't read this when its loader failed", () => {
    render(<NeedsYou result={{ ok: false, detail: "boom" }} />);
    expect(screen.getByText(TILE_FAILED)).toBeVisible();
    expect(screen.queryByText(NOTHING_NEEDS_YOU)).toBeNull();
  });
});
