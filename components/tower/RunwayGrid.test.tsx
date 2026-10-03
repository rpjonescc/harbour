// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { BLOG_CARD, DOCS_CARD, EXAMPLE_BRIEFING } from "@/components/design/tower-example-data";
import { TILE_FAILED } from "@/lib/explain/tower";
import { RunwayGrid } from "./RunwayGrid";

const ok = { ok: true as const, data: [DOCS_CARD, BLOG_CARD] };

describe("RunwayGrid", () => {
  it("leads with the briefing and lists one card per product, in order", () => {
    render(<RunwayGrid result={ok} briefing={EXAMPLE_BRIEFING} isSample={false} />);
    const section = screen.getByRole("region", { name: "Your products" });
    expect(section).toHaveAttribute("id", "tower-products");
    expect(within(section).getByText(EXAMPLE_BRIEFING.sentence)).toBeVisible();
    expect(within(section).getByText(EXAMPLE_BRIEFING.subLine)).toBeVisible();
    expect(
      within(section)
        .getAllByRole("article")
        .map((a) => a.getAttribute("aria-labelledby")),
    ).toHaveLength(2);
    const headings = within(section).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Acme Docs", "Acme Blog"]);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("marks sample data so it is never mistaken for real results", () => {
    render(<RunwayGrid result={ok} briefing={EXAMPLE_BRIEFING} isSample />);
    expect(screen.getByText("Sample")).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent(/Sample data/);
  });

  it("keeps the briefing but says the cards couldn't be read when the loader failed", () => {
    render(
      <RunwayGrid
        result={{ ok: false, detail: "boom" }}
        briefing={EXAMPLE_BRIEFING}
        isSample={false}
      />,
    );
    expect(screen.getByText(EXAMPLE_BRIEFING.sentence)).toBeVisible();
    expect(screen.getByText(TILE_FAILED)).toBeVisible();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("says there are no products yet, with a way to add one", () => {
    render(
      <RunwayGrid result={{ ok: true, data: [] }} briefing={EXAMPLE_BRIEFING} isSample={false} />,
    );
    expect(screen.getByText(/No products are set up yet/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Add a product in Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
