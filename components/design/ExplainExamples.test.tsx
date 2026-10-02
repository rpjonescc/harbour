// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ExplainExamples } from "./ExplainExamples";

describe("ExplainExamples", () => {
  it("shows every plain-language component, nested under the design page's heading", () => {
    render(<ExplainExamples />);
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    for (const label of ["Strong", "Good", "Fair", "No score yet"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("Needs work").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Technical details/, { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to do right now.")).toBeInTheDocument();
  });

  it("gives each What's this? button its own accessible name", () => {
    render(<ExplainExamples />);
    const names = screen
      .getAllByRole("button", { name: /^What's this\?/ })
      .map((button) => button.textContent);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });
});
