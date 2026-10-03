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

  it("shows every state of the Pages in Google panel, each with its own heading and Technical details", () => {
    render(<ScanExamples />);
    expect(screen.getAllByRole("heading", { name: "Pages in Google" })).toHaveLength(11);
    for (const text of [
      "In Google: 3 of 53 pages",
      "Checking, 20 of 53 so far",
      "Search Console isn't connected, so Harbour can't see which pages Google has added.",
      "2 pages couldn't be checked yet.",
      "Harbour found no sitemap pages to check.",
      "Google's daily limit was reached; the check continues tomorrow.",
      "Google hasn't answered about any page yet.",
      "Harbour couldn't read your site in the last check, so it has no pages to ask Google about. It will try again.",
      "Not checked yet: it starts with the next check.",
    ]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    const ids = screen.getAllByRole("heading", { name: "Pages in Google" }).map((h) => h.id);
    expect(new Set(ids).size).toBe(11);
  });
});
