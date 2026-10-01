// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "seo", label: "SEO", panel: <p>SEO panel</p> },
  { id: "geo", label: "GEO", panel: <p>GEO panel</p> },
  { id: "aeo", label: "AEO", panel: <p>AEO panel</p> },
];

const tab = (name: string) => screen.getByRole("tab", { name });
const visiblePanel = () => screen.getByRole("tabpanel");

describe("Tabs", () => {
  it("wires tabs to panels and shows the first", () => {
    render(<Tabs label="Score breakdown" tabs={TABS} />);
    expect(screen.getByRole("tablist", { name: "Score breakdown" })).toBeInTheDocument();
    expect(tab("SEO")).toHaveAttribute("aria-selected", "true");
    expect(tab("GEO")).toHaveAttribute("aria-selected", "false");
    expect(visiblePanel()).toHaveTextContent("SEO panel");
    expect(visiblePanel()).toHaveAttribute("aria-labelledby", tab("SEO").id);
    expect(tab("SEO")).toHaveAttribute("aria-controls", visiblePanel().id);
  });

  it("keeps one tab in the tab order (roving tabindex)", () => {
    render(<Tabs label="Score breakdown" tabs={TABS} />);
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves with arrow keys, wrapping, and Home/End; selection follows focus", () => {
    render(<Tabs label="Score breakdown" tabs={TABS} />);
    fireEvent.keyDown(tab("SEO"), { key: "ArrowRight" });
    expect(tab("GEO")).toHaveFocus();
    expect(tab("GEO")).toHaveAttribute("aria-selected", "true");
    expect(visiblePanel()).toHaveTextContent("GEO panel");
    fireEvent.keyDown(tab("GEO"), { key: "End" });
    expect(tab("AEO")).toHaveFocus();
    fireEvent.keyDown(tab("AEO"), { key: "ArrowRight" });
    expect(tab("SEO")).toHaveFocus();
    fireEvent.keyDown(tab("SEO"), { key: "ArrowLeft" });
    expect(tab("AEO")).toHaveFocus();
    fireEvent.keyDown(tab("AEO"), { key: "Home" });
    expect(tab("SEO")).toHaveFocus();
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it("selects a tab on click", () => {
    render(<Tabs label="Score breakdown" tabs={TABS} />);
    fireEvent.click(tab("AEO"));
    expect(visiblePanel()).toHaveTextContent("AEO panel");
  });
});
