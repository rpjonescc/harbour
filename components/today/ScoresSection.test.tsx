// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { sampleToday } from "@/lib/today/sample";
import { ScoresSection } from "./ScoresSection";

const { scores } = sampleToday(getProducts());

describe("ScoresSection", () => {
  it("leads with verdicts and explains each area in one line", () => {
    render(<ScoresSection scores={scores} />);
    const section = screen.getByRole("region", { name: "How your sites are doing" });
    expect(within(section).getByRole("table", { name: "Scores by product" })).toBeVisible();
    const guide = within(section).getByRole("list", { name: "What the columns mean" });
    for (const name of ["Found on Google", "Recommended by AI assistants", "Answer-ready"]) {
      expect(within(guide).getByRole("button", { name: `What's this? (${name})` })).toBeVisible();
    }
  });

  // The board opens on To do and In progress, so "ideas" would promise a column it hides.
  it("points each area's next step at what's worth doing on the Actions board", () => {
    render(<ScoresSection scores={scores} />);
    fireEvent.click(screen.getByRole("button", { name: "What's this? (Answer-ready)" }));
    expect(
      screen.getByRole("link", { name: "See what's worth doing for Answer-ready" }),
    ).toHaveAttribute("href", "/actions?area=AEO");
  });

  it("keeps the numbers, codes and 30-day trend one click away under Technical details", () => {
    render(<ScoresSection scores={scores} />);
    const numbers = screen.getByRole("table", {
      name: "Visibility scores by product",
      hidden: true,
    });
    expect(numbers.closest("details")).not.toBeNull();
    expect(numbers).not.toBeVisible();
    expect(screen.getByText(/^Technical details/)).toHaveTextContent(
      "Technical details (scores in numbers)",
    );
  });
});
