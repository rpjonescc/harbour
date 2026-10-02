// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { SourcesView } from "@/lib/scan/sources-view";
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
  it("shows the daily schedule", () => {
    render(<SourcesOverview view={view} locale="en-GB" />);
    expect(screen.getByText(/Every product at 06:00 \(Europe\/London\)/)).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
  });

  it("shows the schedule off", () => {
    render(
      <SourcesOverview
        view={{ ...view, schedule: { ...view.schedule, enabled: false } }}
        locale="en-GB"
      />,
    );
    expect(screen.getByText(/HARBOUR_SCHEDULED_SCANS=off/)).toBeInTheDocument();
  });

  it("lists connections with setup links for the ones not connected", () => {
    render(<SourcesOverview view={view} locale="en-GB" />);
    const list = screen.getByRole("list", { name: "Connections" });
    const pagespeed = within(list).getByText("PageSpeed").closest("li") as HTMLElement;
    expect(pagespeed).toHaveTextContent("Not connected");
    expect(within(pagespeed).getByRole("link", { name: /Connect PageSpeed/ })).toHaveAttribute(
      "href",
      "https://github.com/rpjonescc/harbour#connect-pagespeed",
    );
    const gsc = within(list).getByText("Search Console").closest("li") as HTMLElement;
    expect(gsc).toHaveTextContent("Connected");
    expect(gsc).toHaveTextContent("No property for Fern & Field.");
  });

  it("gives each product's scan times and each source's last status and reason", () => {
    render(<SourcesOverview view={view} locale="en-GB" />);
    const acme = screen.getByRole("region", { name: "Acme Docs" });
    expect(acme).toHaveTextContent(
      "Last check 1 Oct 2026, 06:04 (partial) · Next check: tomorrow at 06:00",
    );
    const row = within(acme).getByRole("row", { name: /Search Console/ });
    expect(row).toHaveTextContent("failed");
    expect(row).toHaveTextContent("Search Console refused access");
    const fern = screen.getByRole("region", { name: "Fern & Field" });
    expect(fern).toHaveTextContent("Check running now");
    expect(within(fern).getAllByText("never ran")).toHaveLength(4);
  });
});
