// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ScanExamples } from "./ScanExamples";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("ScanExamples", () => {
  it("shows every state of an issue card's action chip, each with its own heading", () => {
    render(<ScanExamples />);
    for (const text of [
      "Claude is on it",
      "Waiting for you",
      "Done — still found in the last check",
      "Snoozed until 20 Oct 2026",
      "Tracking starts with the next check",
    ]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    const headings = screen.getAllByRole("heading", { level: 3, name: "2 pages have no title" });
    expect(headings).toHaveLength(5);
    expect(new Set(headings.map((h) => h.id)).size).toBe(5);
  });
});
