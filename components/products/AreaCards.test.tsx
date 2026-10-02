// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ScanState, ScoreTrend } from "@/lib/scan/views";
import { AreaCards } from "./AreaCards";

const AT = new Date("2026-10-01T06:00:00Z");
const noScan: ScanState = { active: null, last: null };
const scored: ScoreTrend = {
  latest: {
    scanId: 1,
    computedAt: AT,
    formulaVersion: "v1",
    totals: { seo: 64, geo: 41, aeo: null },
    complete: { seo: false, geo: true, aeo: false },
    breakdown: [],
  },
  deltas: { seo: 3, geo: null, aeo: null },
  trend: [61, 64],
};
const unscanned: ScoreTrend = {
  latest: null,
  deltas: { seo: null, geo: null, aeo: null },
  trend: [],
};

const card = (name: string) =>
  within(screen.getByRole("list", { name: "Your three scores" }))
    .getAllByRole("listitem")
    .find((li) => li.textContent?.startsWith(name)) as HTMLElement;

describe("AreaCards", () => {
  it("shows each area by its plain name with a verdict, the small number and the trend", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    expect(card("Found on Google")).toHaveTextContent("Fair 64 out of 100");
    expect(card("Found on Google")).toHaveTextContent("up 3 since the last check");
    expect(card("Found on Google")).toHaveTextContent("Some data was missing, so this may change.");
    expect(card("Recommended by AI assistants")).toHaveTextContent("Needs work 41 out of 100");
  });

  it("says why an area has no score instead of showing a zero", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    expect(card("Answer-ready")).toHaveTextContent("No score yet");
    expect(card("Answer-ready")).toHaveTextContent("The data for this didn't arrive.");
    expect(card("Answer-ready")).not.toHaveTextContent(/\b0\b/);
  });

  it("explains a product that was never scanned, or whose first scan failed", () => {
    const { unmount } = render(<AreaCards scores={unscanned} scan={noScan} />);
    expect(card("Found on Google")).toHaveTextContent("Not checked yet.");
    unmount();
    const failed: ScanState = {
      active: null,
      last: {
        scanId: 1,
        status: "failed",
        startedAt: AT,
        finishedAt: AT,
        error: null,
        failedCollectors: [],
      },
    };
    render(<AreaCards scores={unscanned} scan={failed} />);
    expect(card("Found on Google")).toHaveTextContent("The last check didn't finish.");
  });

  it("opens the four-part explainer from the keyboard-reachable button", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    const button = screen.getByRole("button", { name: /What's this\? \(Found on Google\)/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(card("Found on Google")).getByText("Why Harbour checks it")).toBeInTheDocument();
    expect(
      within(card("Found on Google")).getByRole("link", {
        name: "See what's worth doing for Found on Google",
      }),
    ).toHaveAttribute("href", "/actions?area=SEO");
  });

  it("uses no area codes and none of the old tile names", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    expect(screen.queryByText(/^(SEO|GEO|AEO)$/)).toBeNull();
    for (const old of ["Search engines", "AI assistants", "Direct answers"]) {
      expect(screen.queryByText(old, { exact: true })).toBeNull();
    }
  });
});
