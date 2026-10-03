// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { BUSY_WEEK, QUIET_WEEK_WINS } from "@/components/design/tower-feed-example-data";
import { WeekBars } from "./WeekBars";

describe("WeekBars", () => {
  it("draws seven bars, each with its day and its number in text", () => {
    const { container } = render(<WeekBars bars={BUSY_WEEK.bars} />);
    const chart = container.querySelector("[data-week-bars]");
    expect(chart).toHaveAttribute("aria-hidden", "true");
    const bars = chart?.querySelectorAll("[data-bar]") ?? [];
    expect(bars).toHaveLength(7);
    for (const [i, bar] of [...bars].entries()) {
      const { label, count } = BUSY_WEEK.bars[i] ?? { label: "", count: -1 };
      expect(bar).toHaveTextContent(label);
      expect(bar).toHaveTextContent(String(count));
      expect(bar.querySelector("svg rect")).not.toBeNull();
    }
  });

  it("scales bars to the busiest day and keeps a sliver for an empty one", () => {
    const { container } = render(<WeekBars bars={BUSY_WEEK.bars} />);
    const heights = [...container.querySelectorAll("[data-bar] rect")].map((r) =>
      Number(r.getAttribute("height")),
    );
    expect(heights[2]).toBe(40);
    expect(heights[1]).toBeGreaterThan(0);
    expect(heights[1]).toBeLessThan(heights[0] ?? 0);
  });

  it("has a table with the same numbers for screen readers", () => {
    render(<WeekBars bars={BUSY_WEEK.bars} />);
    const table = screen.getByRole("table", { name: "Cards finished each day" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(
      BUSY_WEEK.bars.map((b) => `${b.label}${b.count}`),
    );
    expect(within(table).getByRole("columnheader", { name: "Cards finished" })).toBeInTheDocument();
  });

  it("draws an all-zero week without dividing by zero", () => {
    const { container } = render(<WeekBars bars={QUIET_WEEK_WINS.bars} />);
    for (const rect of container.querySelectorAll("rect")) {
      expect(Number(rect.getAttribute("height"))).toBeGreaterThan(0);
    }
  });
});
