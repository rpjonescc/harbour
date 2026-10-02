// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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
  briefing: {
    sentence:
      "Your site is in fair shape. Biggest opportunity: Found on Google for Acme Docs (fair).",
    subLine: "1 thing worth doing · Google speed test (PageSpeed) had a problem in the last check",
  },
  scores: [
    {
      productId: "acme-docs",
      scanned: true,
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
      effort: "small",
      title: "2 pages have no title",
      reason: "Google uses the title as the headline of each result.",
      who: "claude",
      href: "/actions#action-7",
    },
  ],
  failures: [{ productId: "acme-docs", collector: "pagespeed", error: "quota exceeded" }],
  moreActions: 0,
};

describe("TodayView", () => {
  it("before any scan shows the sample, flagged, with unlinked sample actions", () => {
    const sample = sampleToday(getProducts());
    renderToday(sample);
    expect(screen.getByRole("note")).toHaveTextContent(/Sample data/);
    expect(screen.getByText("Sample", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sample.briefing.sentence);
    expect(screen.getByText(/not checked yet/)).toBeInTheDocument();
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
    expect(
      screen.getByText(/the last check didn't finish \(1 Oct 2026, 06:02\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Page check · Acme Docs")).toBeInTheDocument();
    expect(screen.getByText("crawler · acme-docs: Could not crawl")).not.toBeVisible();
  });

  it("says when the first scan is running", () => {
    renderToday({ ...sampleToday(getProducts()), scanning: true });
    expect(screen.getByText(/checking your sites now/)).toBeInTheDocument();
  });

  it("with scans shows real scores, linked actions and failing sources, without the banner", () => {
    renderToday(real);
    expect(screen.queryByText(/Sample data/)).toBeNull();
    expect(screen.getByText(/last checked 1 Oct 2026, 06:04/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(real.briefing.sentence);
    expect(screen.getByText(real.briefing.subLine)).toBeInTheDocument();
    expect(screen.queryByText("Sample", { exact: true })).toBeNull();
    expect(screen.getByRole("link", { name: "2 pages have no title" })).toHaveAttribute(
      "href",
      "/actions#action-7",
    );
    expect(
      screen.getByRole("heading", {
        name: "Google speed test (PageSpeed) had a problem in the last check",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Google speed test (PageSpeed) · Acme Docs")).toBeInTheDocument();
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
    expect(screen.getByText("Nothing to do right now.")).toBeInTheDocument();
  });

  it("lists what's worth doing next with why, the size of the job and who's on it", () => {
    renderToday(real);
    const section = screen.getByRole("region", { name: "Worth doing next" });
    const card = within(section).getByRole("article", { name: "2 pages have no title" });
    expect(card).toHaveTextContent("Big win");
    expect(card).toHaveTextContent("Found on Google · quick job");
    expect(card).toHaveTextContent("Google uses the title as the headline of each result.");
    expect(card).toHaveTextContent("Acme Docs · Claude is on it");
  });

  it("shows the cost meter on the sample and on real Today", () => {
    const { unmount } = renderToday(sampleToday(getProducts()));
    expect(screen.getByText(/^No paid data connected/)).toBeInTheDocument();
    unmount();
    renderToday(real);
    expect(screen.getByText(/^No paid data connected/)).toBeInTheDocument();
  });

  it("warns about a failed or stale backup, and says nothing when backups are fine", () => {
    const { unmount } = renderToday(real, EXAMPLE_BACKUPS.failed);
    expect(screen.getByText(/The backup on 2 Oct, 03:10 didn't finish/)).toBeVisible();
    unmount();
    const stale = renderToday(real, EXAMPLE_BACKUPS.stale);
    expect(screen.getByText(/No backup in the last 2 days/)).toBeVisible();
    stale.unmount();
    const unreadable = renderToday(real, EXAMPLE_BACKUPS.unreadable);
    expect(screen.getByText(/can't open the backup folder/)).toBeVisible();
    unreadable.unmount();
    renderToday(real);
    expect(screen.queryByText(/backup/i)).toBeNull();
  });

  it("keeps spend, backups and data source trouble together, behind the scenes", () => {
    renderToday(real, EXAMPLE_BACKUPS.stale);
    const behind = screen.getByRole("region", { name: "Behind the scenes" });
    expect(behind).toHaveTextContent(/^Behind the scenes/);
    expect(behind).toHaveTextContent("No paid data connected");
    expect(behind).toHaveTextContent("No backup in the last 2 days");
    expect(behind).toHaveTextContent(
      "Google speed test (PageSpeed) had a problem in the last check",
    );
  });

  it("shows plain verdicts per product, with the numbers under Technical details", () => {
    renderToday(real);
    const table = screen.getByRole("table", { name: "Scores by product" });
    const [seo, geo] = within(within(table).getByRole("row", { name: /Acme Docs/ })).getAllByRole(
      "cell",
    );
    expect(seo).toHaveTextContent("Fair 61 out of 100 up 2 since the last check");
    expect(geo).toHaveTextContent("Needs work 40 out of 100");
    expect(
      screen.getByRole("table", { name: "Visibility scores by product", hidden: true }),
    ).not.toBeVisible();
  });
});
