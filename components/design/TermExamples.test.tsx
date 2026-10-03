// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { TermExamples } from "./TermExamples";

describe("TermExamples", () => {
  it("shows terms that explain themselves and a header with page help, from demo data only", () => {
    render(<TermExamples />);
    expect(screen.getAllByRole("tooltip", { hidden: true }).length).toBeGreaterThanOrEqual(5);
    fireEvent.click(screen.getByRole("button", { name: "in Google" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Google has stored the page/);
    expect(screen.getByRole("heading", { level: 2, name: "Acme Docs" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: "What's this page?" })).toBeInTheDocument();
  });
});
