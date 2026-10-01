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
    expect(screen.getByRole("option", { name: "Open and in progress" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("keeps the selected values and offers to clear them", () => {
    renderFilters({ productId: "acme-shop", area: "GEO", status: "done" });
    expect(screen.getByLabelText("Product")).toHaveValue("acme-shop");
    expect(screen.getByLabelText("Area")).toHaveValue("GEO");
    expect(screen.getByLabelText("Status")).toHaveValue("done");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/actions");
  });
});
