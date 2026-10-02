// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { sampleToday } from "@/lib/today/sample";
import type { ProductScores } from "@/lib/today/types";
import { ScoreTable } from "./ScoreTable";

const row = (over: Partial<ProductScores>): ProductScores => ({
  productId: "acme-docs",
  scanned: true,
  lastCheckFailed: false,
  totals: { seo: 61, geo: 40, aeo: 22 },
  complete: { seo: true, geo: true, aeo: true },
  deltas: { seo: 2, geo: null, aeo: null },
  trend: [59, 61],
  ...over,
});

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

  it("links each product to its page", () => {
    render(<ScoreTable scores={[row({})]} />);
    expect(screen.getByRole("link", { name: "Acme Docs" })).toHaveAttribute(
      "href",
      "/products/acme-docs",
    );
  });

  it("shows gaps, incomplete scores and a missing trend for what they are", () => {
    render(
      <ScoreTable
        scores={[
          row({
            totals: { seo: 61, geo: null, aeo: 22 },
            complete: { seo: false, geo: false, aeo: true },
            trend: [61],
          }),
        ]}
      />,
    );
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual([
      "61* (incomplete)▲up 2",
      "—no score",
      "22",
      "—Not enough checks for a trend yet",
    ]);
    expect(screen.getByText(/Incomplete: a source is not connected or failed/)).toBeInTheDocument();
  });
});
