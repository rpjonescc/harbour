// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { IndexingState } from "@/lib/scan/indexing-view";
import { IndexingPanel } from "./IndexingPanel";

const BY_STATE = {
  indexed: 3,
  discovered_not_indexed: 40,
  crawled_not_indexed: 6,
  unknown_to_google: 2,
  blocked: 1,
  other: 1,
  unknown: 0,
};
const counted = (
  over: Partial<Extract<IndexingState, { state: "counted" }>> = {},
): IndexingState => ({
  state: "counted",
  indexed: 3,
  checked: 53,
  total: 53,
  byState: BY_STATE,
  checkedThrough: "2026-10-01T06:00:00.000Z",
  ...over,
});

const panel = (indexing: IndexingState) => {
  render(<IndexingPanel indexing={indexing} locale="en-GB" />);
  return screen.getByRole("region", { name: "Pages in Google" });
};
const outsideDetails = (region: HTMLElement) => {
  const copy = region.cloneNode(true) as HTMLElement;
  for (const d of copy.querySelectorAll("details")) d.remove();
  return copy.textContent ?? "";
};

describe("IndexingPanel", () => {
  it("leads with the count, one sentence explaining it, and the breakdown under Technical details", () => {
    const region = panel(counted());
    expect(within(region).getByText("In Google: 3 of 53 pages")).toBeInTheDocument();
    expect(region).toHaveTextContent(/Pages it hasn't added can't be found there/);
    expect(within(region).getByRole("button", { name: /What's this\?/ })).toBeInTheDocument();
    const found = within(region).getByText("Found, not added yet");
    expect(found.closest("details")).not.toBeNull();
    expect(found.closest("tr")).toHaveTextContent("40");
    expect(outsideDetails(region)).not.toMatch(/discovered|crawled|coverage|\bscan\b/i);
    expect(region).toHaveTextContent("The oldest of these checks was on 1 Oct 2026");
  });

  it("says how far a large site has got instead of a final count", () => {
    const region = panel(counted({ checked: 20, indexed: 1 }));
    expect(within(region).getByText("Checking, 20 of 53 so far")).toBeInTheDocument();
    expect(region).toHaveTextContent("So far, 1 of the 20 pages checked is in Google.");
    expect(region).not.toHaveTextContent("In Google: 1 of 53");
  });

  it("shows checking progress, not a zero count, when nothing is known yet", () => {
    const region = panel(
      counted({
        checked: 0,
        indexed: 0,
        checkedThrough: null,
        byState: { ...BY_STATE, indexed: 0 },
      }),
    );
    expect(within(region).getByText("Checking, 0 of 53 so far")).toBeInTheDocument();
    expect(region).not.toHaveTextContent(/In Google: 0/);
  });

  it("uses the singular for one page", () => {
    const region = panel(counted({ indexed: 1, checked: 1, total: 1 }));
    expect(within(region).getByText("In Google: 1 of 1 page")).toBeInTheDocument();
  });

  it.each([
    ["not_connected", "Search Console isn't connected"],
    ["no_sitemap", "Harbour found no sitemap pages to check."],
    ["failed", "Google didn't answer the page checks in the last check."],
    ["waiting", "Not checked yet: it starts with the next check."],
  ] as const)("says why there is no count (%s) and never shows 0", (why, text) => {
    const region = panel({ state: "empty", why, reason: null });
    expect(region).toHaveTextContent(text);
    expect(region).not.toHaveTextContent(/In Google|\b0\b/);
  });

  it("keeps the raw reason, with setting names, inside Technical details only", () => {
    const region = panel({
      state: "empty",
      why: "failed",
      reason: "Search Console refused access (HTTP 403): HARBOUR_GSC_CREDENTIALS",
    });
    expect(outsideDetails(region)).not.toMatch(/HARBOUR_|403/);
    expect(
      within(region)
        .getByText(/HTTP 403/)
        .closest("details"),
    ).not.toBeNull();
  });
});
