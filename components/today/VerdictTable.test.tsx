// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ProductScores } from "@/lib/today/types";
import { VerdictTable } from "./VerdictTable";

const none = { seo: null, geo: null, aeo: null };
const row = (over: Partial<ProductScores> = {}): ProductScores => ({
  productId: "acme-docs",
  scanned: true,
  totals: { seo: 78, geo: 46, aeo: null },
  complete: { seo: true, geo: false, aeo: false },
  deltas: { seo: 2, geo: null, aeo: null },
  trend: [76, 78],
  ...over,
});
const cellsOf = (name: RegExp) => within(screen.getByRole("row", { name })).getAllByRole("cell");

describe("VerdictTable", () => {
  it("has a row per product and a plain-named column per area", () => {
    render(<VerdictTable scores={[row()]} />);
    const table = screen.getByRole("table", { name: "Scores by product" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Product", "Found on Google", "Recommended by AI assistants", "Answer-ready"]);
    expect(within(table).getByRole("link", { name: "Acme Docs" })).toHaveAttribute(
      "href",
      "/products/acme-docs",
    );
  });

  it("leads each cell with the verdict, the number beside it, and says what's missing", () => {
    render(<VerdictTable scores={[row()]} />);
    const [seo, geo, aeo] = cellsOf(/Acme Docs/);
    expect(seo).toHaveTextContent("Good 78 out of 100 up 2 since the last check");
    expect(geo).toHaveTextContent("Needs work 46 out of 100* (some data missing)");
    expect(aeo).toHaveTextContent("No score yet The data for this didn't arrive.");
    expect(screen.getByText(/Some data was missing in the last check/)).toBeInTheDocument();
  });

  it("says a product not checked yet is a gap, not a zero", () => {
    render(
      <VerdictTable
        scores={[
          row({
            productId: "fern-and-field",
            scanned: false,
            totals: none,
            deltas: none,
            trend: [],
          }),
        ]}
      />,
    );
    for (const cell of cellsOf(/Fern & Field/)) {
      expect(cell).toHaveTextContent("No score yet Not checked yet.");
    }
    expect(screen.queryByText(/Some data was missing/)).toBeNull();
  });

  // Review Focus 2: every collector failed, so the product was scanned but has no scores.
  it("says a scanned product with no scores is missing data, never Needs work", () => {
    render(<VerdictTable scores={[row({ totals: none, deltas: none })]} />);
    for (const cell of cellsOf(/Acme Docs/)) {
      expect(cell).toHaveTextContent("No score yet The data for this didn't arrive.");
    }
    expect(screen.queryByText("Needs work")).toBeNull();
  });
});
