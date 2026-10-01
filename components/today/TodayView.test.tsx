// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EXAMPLE_BACKUPS } from "@/components/design/ops-example-data";
import type { BackupStatus } from "@/lib/ops/backup-status";
import { getProducts } from "@/lib/products/catalog";
import { sampleToday } from "@/lib/today/sample";
import type { TodaySummary } from "@/lib/today/types";
import { TodayView } from "./TodayView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NOW = new Date("2026-10-01T09:00:00Z");
const renderToday = (today: TodaySummary, backup: BackupStatus = EXAMPLE_BACKUPS.ok) =>
  render(
    <TodayView
      today={today}
      backup={backup}
      costMeter={{ state: "no-paid-sources", spentMicro: 0, unconfirmedMicro: 0 }}
      now={NOW}
      timeZone="UTC"
      locale="en-GB"
    />,
  );

const real: TodaySummary = {
  isSample: false,
  scannedAt: new Date("2026-10-01T06:04:00Z"),
  scanning: false,
  lastFailedAt: null,
  headline: "One thing worth your attention.",
  scores: [
    {
      productId: "acme-docs",
      totals: { seo: 61, geo: 40, aeo: 22 },
      complete: { seo: true, geo: true, aeo: true },
      deltas: { seo: 2, geo: null, aeo: null },
      trend: [59, 61],
    },
  ],
  actions: [
    {
      id: 7,
      productId: "acme-docs",
      area: "SEO",
      impact: "high",
      title: "2 pages have no title",
      detail: "Give each page a unique, descriptive <title>.",
      href: "/actions#action-7",
    },
  ],
  failures: [{ productId: "acme-docs", collector: "pagespeed", error: "quota exceeded" }],
  moreActions: 0,
};

describe("TodayView", () => {
  it("before any scan shows the sample, flagged, with unlinked sample actions", () => {
    renderToday(sampleToday(getProducts()));
    expect(screen.getByRole("note")).toHaveTextContent(/Sample data/);
    expect(screen.getByText(/no scan yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /competitor for one of your target questions/ }),
    ).toBeNull();
  });

  it("says when the last scan failed before any scores exist", () => {
    renderToday({
      ...sampleToday(getProducts()),
      lastFailedAt: new Date("2026-10-01T06:02:00Z"),
      failures: [{ productId: "acme-docs", collector: "crawler", error: "Could not crawl" }],
    });
    expect(screen.getByText(/last scan failed 1 Oct 2026, 06:02/)).toBeInTheDocument();
    expect(screen.getByText(/Crawler · Acme Docs/)).toHaveTextContent("Could not crawl");
  });

  it("says when the first scan is running", () => {
    renderToday({ ...sampleToday(getProducts()), scanning: true });
    expect(screen.getByText(/scan running/)).toBeInTheDocument();
  });

  it("with scans shows real scores, linked actions and failing sources, without the banner", () => {
    renderToday(real);
    expect(screen.queryByText(/Sample data/)).toBeNull();
    expect(screen.getByText(/last scan 1 Oct 2026, 06:04/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "One thing worth your attention.",
    );
    expect(screen.getByRole("link", { name: "2 pages have no title" })).toHaveAttribute(
      "href",
      "/actions#action-7",
    );
    expect(
      screen.getByRole("heading", { name: "A source failed in the last scan" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed · Acme Docs/)).toHaveTextContent("quota exceeded");
  });

  it("links the actions beyond the top ones to the Actions board", () => {
    renderToday({ ...real, moreActions: 3 });
    expect(screen.getByRole("link", { name: "3 more on the Actions board" })).toHaveAttribute(
      "href",
      "/actions",
    );
  });

  it("adds no note when every active action is shown", () => {
    renderToday(real);
    expect(screen.queryByText(/more on the Actions board/)).not.toBeInTheDocument();
  });

  it("says so when no action is open", () => {
    renderToday({ ...real, actions: [], failures: [] });
    expect(
      screen.getByText("Nothing open — new actions arrive with each scan."),
    ).toBeInTheDocument();
  });

  it("shows the cost meter on the sample and on real Today", () => {
    const { unmount } = renderToday(sampleToday(getProducts()));
    expect(screen.getByText("No paid sources connected")).toBeInTheDocument();
    unmount();
    renderToday(real);
    expect(screen.getByText("No paid sources connected")).toBeInTheDocument();
  });

  it("warns about a failed or stale backup, and says nothing when backups are fine", () => {
    const { unmount } = renderToday(real, EXAMPLE_BACKUPS.failed);
    expect(screen.getByText(/The backup on 2 Oct, 03:10 failed: No space left/)).toBeVisible();
    unmount();
    const stale = renderToday(real, EXAMPLE_BACKUPS.stale);
    expect(screen.getByText(/No backup in the last 2 days/)).toBeVisible();
    stale.unmount();
    const unreadable = renderToday(real, EXAMPLE_BACKUPS.unreadable);
    expect(screen.getByText(/can't read the backup folder/)).toBeVisible();
    unreadable.unmount();
    renderToday(real);
    expect(screen.queryByText(/backup/i)).toBeNull();
  });
});
