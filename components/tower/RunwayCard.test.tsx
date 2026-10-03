// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BLOG_CARD, DOCS_CARD, FALLING_CARD } from "@/components/design/tower-example-data";
import { RunwayCard } from "./RunwayCard";

describe("RunwayCard", () => {
  it("links its heading to the product and shows the verdict word and the trend in words", () => {
    render(<RunwayCard card={DOCS_CARD} />);
    const card = screen.getByRole("article", { name: "Acme Docs" });
    const heading = within(card).getByRole("heading", { level: 3, name: "Acme Docs" });
    expect(within(heading).getByRole("link")).toHaveAttribute("href", "/products/acme-docs");
    expect(within(card).getByText("Good")).toBeVisible();
    expect(within(card).getByText("up 4 since last week")).toBeVisible();
  });

  it("links the next action and the content line, and shows the check and Claude's touch", () => {
    render(<RunwayCard card={DOCS_CARD} />);
    expect(screen.getByRole("link", { name: "Add a sitemap" })).toHaveAttribute(
      "href",
      "/actions#action-12",
    );
    expect(
      screen.getByRole("link", {
        name: "2 drafts ready for you · 1 being written · 4 ideas waiting",
      }),
    ).toHaveAttribute("href", "/content");
    expect(screen.getByText("Checked 3 h ago.")).toBeVisible();
    expect(screen.getByText("Claude last updated this product's cards 2 h ago.")).toBeVisible();
  });

  it("shows up to three highlights, each explaining its word in place", () => {
    render(<RunwayCard card={DOCS_CARD} />);
    const google = screen.getByRole("button", { name: "In Google: 3 of 53 pages" });
    fireEvent.focus(google);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Google/);
    expect(screen.getByRole("button", { name: "4 sites link to you" })).toBeVisible();
  });

  it("says plainly what is missing, never a zero", () => {
    render(<RunwayCard card={BLOG_CARD} />);
    expect(screen.getByText("No score yet")).toBeVisible();
    expect(screen.getByText("The data for this didn't arrive.")).toBeVisible();
    expect(screen.getByText("Nothing open for this product right now.")).toBeVisible();
    expect(screen.getByText("Last checked on 29 Sept.")).toBeVisible();
    expect(screen.getByText("Claude hasn't updated these cards this week.")).toBeVisible();
    expect(screen.queryByText(/since last week/)).toBeNull();
    expect(screen.queryByRole("link", { name: /drafts?/ })).toBeNull();
    expect(screen.queryByText(/\b0\b/)).toBeNull();
  });

  it("puts an arrow beside a falling trend, hidden from screen readers", () => {
    render(<RunwayCard card={FALLING_CARD} />);
    const trend = screen.getByText("down 3 since last week");
    expect(trend.parentElement?.querySelector("[aria-hidden='true']")).toHaveTextContent("↓");
  });
});
