// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { SearchState } from "@/lib/scan/product-view";
import type { SearchSummary } from "@/lib/scan/search-summary";
import { SearchConsolePanel } from "./SearchConsolePanel";

const panel = (search: SearchState, locale = "en-GB") => {
  render(<SearchConsolePanel search={search} locale={locale} />);
  return screen.getByRole("region", { name: "Google Search Console" });
};
const SUMMARY: SearchSummary = {
  startDate: "2026-09-01",
  endDate: "2026-09-28",
  days: [
    { date: "2026-09-01", clicks: 4, impressions: 100 },
    { date: "2026-09-02", clicks: 6, impressions: 140 },
  ],
  clicks: 10,
  impressions: 240,
  topQueries: [{ query: "acme docs install", clicks: 7, impressions: 90, position: 3.4 }],
};
const outsideDetails = (region: HTMLElement) => {
  const copy = region.cloneNode(true) as HTMLElement;
  for (const d of copy.querySelectorAll("details")) d.remove();
  return copy.textContent ?? "";
};

describe("SearchConsolePanel", () => {
  it("says it isn't connected, why that matters and how to connect it, keeping the setting name in Technical details", () => {
    const region = panel({ state: "not_configured", reason: "HARBOUR_GSC_CREDENTIALS is not set" });
    expect(within(region).getByText("Not connected yet")).toBeInTheDocument();
    expect(region).toHaveTextContent(/how often Google showed your pages/i);
    expect(region).toHaveTextContent("missing, not zero");
    expect(
      within(region).getByRole("link", { name: /How to connect Google Search Console/ }),
    ).toHaveAttribute("href", "https://github.com/rpjonescc/harbour#connect-search-console");
    expect(outsideDetails(region)).not.toMatch(/HARBOUR_/);
    expect(
      within(region).getByText("HARBOUR_GSC_CREDENTIALS is not set").closest("details"),
    ).not.toBeNull();
  });

  it("says Google didn't send the data, using only the word scan, and that Harbour will try again", () => {
    const region = panel({ state: "failed", reason: "403 from the API" });
    expect(within(region).getByText("Needs a look")).toBeInTheDocument();
    expect(
      within(region).getByText(
        "Google didn't send the data in the last scan, so these numbers are missing, not zero.",
      ),
    ).toBeInTheDocument();
    expect(outsideDetails(region)).not.toMatch(/check/i);
    expect(region).toHaveTextContent("Harbour will try again with the next scan.");
    expect(outsideDetails(region)).not.toMatch(/403/);
  });

  it("shows what Google showed first, with the top searches under Technical details", () => {
    const region = panel({ state: "ok", summary: SUMMARY });
    expect(within(region).getByText("Connected")).toBeInTheDocument();
    expect(region).toHaveTextContent(
      "Google showed your pages 240 times, and 10 people clicked through.",
    );
    expect(
      within(region).getByRole("img", { name: /Daily visits from Google/ }),
    ).toBeInTheDocument();
    const details = within(region)
      .getByText(/Technical details/)
      .closest("details") as HTMLElement;
    const heads = within(details)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(heads).toEqual(["Search", "Clicks", "Times shown", "Average position"]);
    expect(
      within(details).getByRole("rowheader", { name: "acme docs install" }),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent("1 Sept 2026 to 28 Sept 2026");
    expect(within(region).queryByRole("link", { name: /How to connect/ })).toBeNull();
  });

  it("formats the numbers in the configured locale", () => {
    const region = panel(
      { state: "ok", summary: { ...SUMMARY, clicks: 1234, impressions: 56789, topQueries: [] } },
      "de-DE",
    );
    expect(region).toHaveTextContent("56.789");
  });

  it("does not offer setup steps when it ran but stored no summary", () => {
    const region = panel({ state: "ok", summary: null });
    expect(region).toHaveTextContent("Google sent no search data for this scan");
    expect(region).not.toHaveTextContent("normal for a new site");
    expect(within(region).queryByRole("link", { name: /How to connect/ })).toBeNull();
  });

  it("explains the wait before the first scan", () => {
    const region = panel({ state: "none", reason: null });
    expect(within(region).getByText("Not connected yet")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /How to connect/ })).toBeInTheDocument();
  });
});
