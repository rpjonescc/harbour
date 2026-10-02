// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { SourcesView } from "@/lib/scan/sources-view";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
import { SourcesOverview } from "./SourcesOverview";

const AT = new Date("2026-10-01T05:04:00Z");
const run = (
  collector: string,
  status: SourcesView["products"][number]["runs"][number]["status"],
  error: string | null = null,
) => ({
  collector,
  status,
  error,
  finishedAt: status ? AT : null,
});

const view: SourcesView = {
  schedule: { enabled: true, timeZone: "Europe/London" },
  connections: {
    pagespeed: false,
    searchConsoleCredentials: true,
    searchConsoleProducts: { "acme-docs": true, "fern-and-field": false },
  },
  products: [
    {
      productId: "acme-docs",
      name: "Acme Docs",
      lastScan: {
        scanId: 1,
        status: "partial",
        startedAt: AT,
        finishedAt: AT,
        error: null,
        failedCollectors: [],
      },
      active: null,
      next: "tomorrow",
      runs: [
        run("crawler", "ok"),
        run("readiness", "ok"),
        run("pagespeed", "not_configured", "HARBOUR_PAGESPEED_API_KEY is not set"),
        run("search-console", "failed", "Search Console refused access"),
      ],
    },
    {
      productId: "fern-and-field",
      name: "Fern & Field",
      lastScan: null,
      active: { jobId: 3, status: "running", since: AT },
      next: "tomorrow",
      runs: [
        run("crawler", null),
        run("readiness", null),
        run("pagespeed", null),
        run("search-console", null),
      ],
    },
  ],
};

describe("SourcesOverview", () => {
  it("reads each connection as Connected or Not connected yet, with steps under Technical details", () => {
    const { container } = render(<SourcesOverview view={view} locale="en-GB" />);
    const list = screen.getByRole("list", { name: "Connections" });
    const speed = within(list)
      .getByText("Google speed test (PageSpeed)")
      .closest("li") as HTMLElement;
    expect(speed).toHaveTextContent("Not connected yet");
    expect(within(speed).getByRole("link", { name: /Connect PageSpeed/ })).toHaveAttribute(
      "href",
      "https://github.com/rpjonescc/harbour#connect-pagespeed",
    );
    const gsc = within(list).getByText("Google Search Console").closest("li") as HTMLElement;
    expect(gsc).toHaveTextContent("Connected");
    expect(gsc).toHaveTextContent("Fern & Field isn't linked to a Search Console site yet.");
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+/);
  });

  it("says the daily check is on or off without a setting name", () => {
    const { container, rerender } = render(<SourcesOverview view={view} locale="en-GB" />);
    expect(
      screen.getByText(/Harbour checks every site at 06:00 \(Europe\/London\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    rerender(
      <SourcesOverview
        view={{ ...view, schedule: { ...view.schedule, enabled: false } }}
        locale="en-GB"
      />,
    );
    expect(screen.getByText(/Daily checks are off/)).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_SCHEDULED/);
  });

  it("gives each product's check times and each source's status, raw reasons under Technical details", () => {
    const { container } = render(<SourcesOverview view={view} locale="en-GB" />);
    const acme = screen.getByRole("region", { name: "Acme Docs" });
    expect(acme).toHaveTextContent(
      "Last check 1 Oct 2026, 06:04 (some data was missing) · Next check: tomorrow at 06:00",
    );
    const row = within(acme).getByRole("row", { name: /Google Search Console/ });
    expect(row).toHaveTextContent("Google didn't send the data in the last check");
    expect(within(row).getByText("(Acme Docs: Google Search Console)")).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toContain("Search Console refused access");
    expect(screen.getByRole("region", { name: "Fern & Field" })).toHaveTextContent(
      "Check running now",
    );
  });
});
