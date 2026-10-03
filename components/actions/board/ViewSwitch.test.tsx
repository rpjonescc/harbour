// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ActionFilter } from "@/lib/actions/views";
import { ViewSwitch, viewHref } from "./ViewSwitch";

const ALL: ActionFilter = { productId: null, area: null, status: "active" };

describe("ViewSwitch", () => {
  it("links Board and List and marks the current view", () => {
    render(<ViewSwitch view="board" filter={ALL} />);
    const nav = screen.getByRole("navigation", { name: "View" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "List" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "List" })).toHaveAttribute(
      "href",
      "/actions?view=list",
    );
  });

  it("keeps the product and area filters, and the status only on the list", () => {
    const filter: ActionFilter = { productId: "acme-docs", area: "SEO", status: "done" };
    expect(viewHref("board", filter)).toBe("/actions?product=acme-docs&area=SEO");
    expect(viewHref("list", filter)).toBe(
      "/actions?view=list&product=acme-docs&area=SEO&status=done",
    );
    expect(viewHref("board", ALL)).toBe("/actions");
  });
});
