// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ActionFilter } from "@/lib/actions/views";
import { ActionFilters } from "./ActionFilters";

const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs" },
  { id: "acme-shop", name: "Acme Shop" },
];
const DEFAULT: ActionFilter = { productId: null, area: null, status: "active" };

const renderFilters = (filter: ActionFilter) =>
  render(<ActionFilters filter={filter} products={PRODUCTS} />);

describe("ActionFilters", () => {
  it("is a plain GET form to /actions with three labelled selects", () => {
    renderFilters(DEFAULT);
    const form = screen.getByRole("form", { name: "Filter actions" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/actions");
    expect(screen.getByLabelText("Product")).toHaveAttribute("name", "product");
    expect(screen.getByLabelText("Area")).toHaveAttribute("name", "area");
    expect(screen.getByLabelText("Status")).toHaveAttribute("name", "status");
    expect(screen.getByRole("button", { name: "Apply" })).toHaveAttribute("type", "submit");
  });

  it("defaults to every product and area, open and in progress, with no clear link", () => {
    renderFilters(DEFAULT);
    expect(screen.getByLabelText("Product")).toHaveValue("");
    expect(screen.getByLabelText("Area")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("active");
    expect(screen.getByRole("option", { name: "Backlog and in progress" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("names the areas in plain words while the URL value stays the code", () => {
    renderFilters(DEFAULT);
    expect(screen.getByRole("option", { name: "Found on Google" })).toHaveValue("SEO");
    expect(screen.getByRole("option", { name: "Recommended by AI assistants" })).toHaveValue("GEO");
    expect(screen.getByRole("option", { name: "Answer-ready" })).toHaveValue("AEO");
  });

  it("keeps the selected values and offers to clear them", () => {
    renderFilters({ productId: "acme-shop", area: "GEO", status: "done" });
    expect(screen.getByLabelText("Product")).toHaveValue("acme-shop");
    expect(screen.getByLabelText("Area")).toHaveValue("GEO");
    expect(screen.getByLabelText("Status")).toHaveValue("done");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/actions?view=list",
    );
  });

  it("shows the new filter after a client navigation (Clear filters, back and forward)", () => {
    // The page re-renders in place: uncontrolled selects would keep the old choice.
    const { rerender } = renderFilters({ productId: "acme-shop", area: "GEO", status: "done" });
    rerender(<ActionFilters filter={DEFAULT} products={PRODUCTS} />);
    expect(screen.getByLabelText("Product")).toHaveValue("");
    expect(screen.getByLabelText("Area")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("active");
  });

  it("keeps the list on the list when applied", () => {
    renderFilters(DEFAULT);
    expect(document.querySelector('input[type="hidden"][name="view"]')).toHaveValue("list");
  });

  it("on the board, drops the status filter (the columns are the statuses)", () => {
    render(
      <ActionFilters
        filter={{ productId: "acme-docs", area: null, status: "done" }}
        products={PRODUCTS}
        view="board"
      />,
    );
    expect(screen.queryByLabelText("Status")).toBeNull();
    expect(document.querySelector('input[name="view"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/actions");
  });
});
