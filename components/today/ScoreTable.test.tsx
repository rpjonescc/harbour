// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { sampleToday } from "@/lib/today/sample";
import { ScoreTable } from "./ScoreTable";

describe("ScoreTable", () => {
  it("renders an accessible table with a row per product", () => {
    render(<ScoreTable scores={sampleToday(getProducts()).scores} />);
    const table = screen.getByRole("table", { name: "Visibility scores by product" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Product", "SEO", "GEO", "AEO", "30 days"]);
    expect(within(table).getByRole("rowheader", { name: "Acme Docs" })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });
});
