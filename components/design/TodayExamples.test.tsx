// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { TodayExamples } from "./TodayExamples";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("TodayExamples", () => {
  it("shows the briefing, the verdict table and a card per who's on it, under the page's heading", () => {
    const [product] = getProducts();
    if (!product) throw new Error("the example config lists products");
    render(<TodayExamples product={product} />);
    expect(screen.queryAllByRole("heading", { level: 1 })).toEqual([]);
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    expect(
      screen.getAllByRole("heading", { level: 3, name: /^Your site is in fair shape\./ }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("region", { name: "A note from Harbour" })).toHaveLength(4);
    expect(screen.getByText("Sample note")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Scores by product" })).toBeInTheDocument();
    for (const phrase of [
      "Claude is on it",
      "Pull request waiting for your OK",
      "Waiting for you",
    ]) {
      expect(screen.getAllByText(phrase).length).toBeGreaterThan(0);
    }
  });
});
