// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Product } from "@/lib/products/catalog";
import { deriveIssues } from "@/lib/scan/issues";
import { pageRows } from "@/lib/scan/page-rows";
import type { ProductView } from "@/lib/scan/product-view";
import { ACME_CRAWL, ALL_OK, readiness } from "@/tests/helpers/scoring";
import { ProductOverview } from "./ProductOverview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const product: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
};
const AT = new Date("2026-10-01T06:04:00Z");

const empty: ProductView = {
  scores: { latest: null, deltas: { seo: null, geo: null, aeo: null }, trend: [] },
  scan: { active: null, last: null },
  issues: [],
  actionByRule: new Map(),
  pages: { rows: [], total: 0 },
  search: { state: "none", reason: null },
};

const scanned: ProductView = {
  scores: {
    latest: {
      scanId: 1,
      computedAt: AT,
      formulaVersion: "v1",
      totals: { seo: 64, geo: 41, aeo: null },
      complete: { seo: false, geo: true, aeo: false },
      breakdown: [
        {
          key: "seo.technical",
          label: "Technical health",
          score: 80,
          weight: 0.35,
          evidence: "6 HTML pages",
          status: "ok",
        },
        {
          key: "seo.cwv",
          label: "Core Web Vitals",
          score: null,
          weight: 0.2,
          evidence: "PageSpeed is not connected",
          status: "missing",
        },
        {
          key: "seo.indexability",
          label: "Indexability",
          score: null,
          weight: 0.25,
          evidence: "Crawler failed in this scan",
          status: "missing",
        },
        {
          key: "geo.aiEngines",
          label: "AI engine mentions",
          score: null,
          weight: 0,
          evidence: "AI engine mention checks not connected",
          status: "missing",
        },
      ],
    },
    deltas: { seo: 3, geo: null, aeo: null },
    trend: [61, 64],
  },
  scan: {
    active: null,
    last: {
      scanId: 1,
      status: "partial",
      startedAt: AT,
      finishedAt: AT,
      error: null,
      failedCollectors: [{ collector: "pagespeed", error: "quota exceeded" }],
    },
  },
  issues: deriveIssues([...ACME_CRAWL, readiness()], ALL_OK),
  actionByRule: new Map([
    ["broken-links", { id: 5, status: "in_progress", snoozedUntil: null }],
    ["noindex", { id: 6, status: "snoozed", snoozedUntil: "2026-10-12" }],
  ]),
  pages: pageRows(ACME_CRAWL),
  search: { state: "not_configured", reason: "HARBOUR_GSC_CREDENTIALS is not set" },
};

const renderPage = (view: ProductView) =>
  render(<ProductOverview product={product} view={view} timeZone="UTC" locale="en-GB" />);

describe("ProductOverview", () => {
  it("for a product never scanned says so everywhere, with Scan now and the research link", () => {
    renderPage(empty);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Acme Docs");
    expect(screen.getByText(/Not scanned yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Research targets" })).toHaveAttribute(
      "href",
      "/settings/products/acme-docs",
    );
    expect(screen.getByText(/Problems Harbour finds will be listed here\./)).toBeInTheDocument();
    expect(screen.getByText(/The pages Harbour checks will be listed here/)).toBeInTheDocument();
    expect(screen.getAllByText("No score yet")).toHaveLength(3);
  });

  it("shows a running scan and disables Scan now", () => {
    renderPage({
      ...empty,
      scan: { active: { jobId: 4, status: "running", since: AT }, last: null },
    });
    expect(screen.getByText(/Scanning now \(started 1 Oct 2026, 06:04\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeDisabled();
  });

  it("shows a failed last scan and which scan the results are from", () => {
    const failed = {
      ...scanned.scan,
      last: {
        ...(scanned.scan.last as NonNullable<ProductView["scan"]["last"]>),
        status: "failed" as const,
        error: "All collectors failed",
      },
    };
    renderPage({ ...scanned, scan: failed });
    expect(
      screen.getByText(
        /The last scan failed \(1 Oct 2026, 06:04\): All collectors failed\. Showing the scan of/,
      ),
    ).toBeInTheDocument();
  });

  it("explains scores: area cards, breakdown with missing reasons and not-connected notes", () => {
    renderPage(scanned);
    expect(screen.getByText(/^Acme Docs is in /)).toBeInTheDocument();
    // The area name is also the first tab's label; the card comes first on the page.
    expect(screen.getAllByText("Found on Google")[0]?.closest("li")).toHaveTextContent(
      "Fair 64 out of 100",
    );
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { name: "Page health" })).toBeInTheDocument();
    expect(within(panel).getByText("Not connected yet, so it isn't counted.")).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed failed: quota exceeded/)).toBeInTheDocument();
  });

  it("lists issues with a hand-off button each, and the crawled pages", () => {
    renderPage(scanned);
    const issues = screen.getByRole("region", { name: "What to fix" });
    expect(within(issues).getAllByRole("article")).toHaveLength(3);
    expect(
      within(issues).getByRole("button", {
        name: "Hand to Claude: 1 page you link to can't be found",
      }),
    ).toBeInTheDocument();
    const pages = screen.getByRole("table", { name: /most to fix first/ });
    expect(within(pages).getByRole("link", { name: "/about" })).toBeInTheDocument();
    expect(within(pages).getByText("Hidden from search")).toBeInTheDocument();
  });

  it("shows each issue's action status with a link to it on the Actions board", () => {
    renderPage(scanned);
    const issue = (name: string) =>
      screen.getByRole("article", { name: new RegExp(name) }) as HTMLElement;
    const broken = issue("you link to can't be found");
    expect(within(broken).getByText("In progress")).toBeInTheDocument();
    expect(
      within(broken).getByRole("link", {
        name: "View on the Actions board: 1 page you link to can't be found",
      }),
    ).toHaveAttribute("href", "/actions?product=acme-docs&status=all#action-5");
    expect(
      within(issue("hidden from search")).getByText("Snoozed until 12 Oct 2026"),
    ).toBeInTheDocument();
    const untracked = issue("opts out of AI training");
    expect(within(untracked).getByText("Tracking starts with the next scan")).toBeInTheDocument();
    expect(
      within(untracked).queryByRole("link", {
        name: /^View on the Actions board/,
      }),
    ).toBeNull();
  });

  it("names open, dismissed and done-but-still-found actions", () => {
    const status = (s: "open" | "dismissed" | "done") => ({ id: 5, status: s, snoozedUntil: null });
    for (const [s, text] of [
      ["open", "To do"],
      ["dismissed", "Dismissed"],
      ["done", "Done — still found in the last scan"],
    ] as const) {
      const { unmount } = renderPage({
        ...scanned,
        actionByRule: new Map([["broken-links", status(s)]]),
      });
      const broken = screen.getByRole("article", { name: /you link to can't be found/ });
      expect(within(broken).getByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows Search Console's setup link and the paid sources as not connected", () => {
    renderPage(scanned);
    const gsc = screen.getByRole("region", { name: "Search Console" });
    expect(gsc).toHaveTextContent("HARBOUR_GSC_CREDENTIALS is not set");
    expect(
      within(gsc).getByRole("link", { name: /How to connect Search Console/ }),
    ).toHaveAttribute("href", "https://github.com/rpjonescc/harbour#connect-search-console");
    for (const name of ["AI engines", "Rankings"]) {
      expect(screen.getByRole("region", { name })).toHaveTextContent(
        "Not connected (needs API keys)",
      );
    }
  });

  it("shows Search Console data when connected", () => {
    renderPage({
      ...scanned,
      search: {
        state: "ok",
        summary: {
          startDate: "2026-09-01",
          endDate: "2026-09-28",
          days: [
            { date: "2026-09-01", clicks: 4, impressions: 100 },
            { date: "2026-09-02", clicks: 6, impressions: 140 },
          ],
          clicks: 10,
          impressions: 240,
          topQueries: [{ query: "acme docs install", clicks: 7, impressions: 90, position: 3.4 }],
        },
      },
    });
    const gsc = screen.getByRole("region", { name: "Search Console" });
    expect(within(gsc).getByText("Connected")).toBeInTheDocument();
    expect(within(gsc).getByRole("img", { name: /Daily clicks/ })).toBeInTheDocument();
    expect(within(gsc).getByRole("rowheader", { name: "acme docs install" })).toBeInTheDocument();
    // Numbers and dates follow HARBOUR_LOCALE (en-GB here).
    expect(gsc).toHaveTextContent("1 Sept 2026 to 28 Sept 2026");
    expect(within(gsc).queryByRole("link", { name: /How to connect/ })).toBeNull();
  });

  it("formats Search Console numbers in the configured locale", () => {
    render(
      <ProductOverview
        product={product}
        view={{
          ...scanned,
          search: {
            state: "ok",
            summary: {
              startDate: "2026-09-01",
              endDate: "2026-09-28",
              days: [],
              clicks: 1234,
              impressions: 56789,
              topQueries: [],
            },
          },
        }}
        timeZone="UTC"
        locale="de-DE"
      />,
    );
    expect(screen.getByRole("region", { name: "Search Console" })).toHaveTextContent("56.789");
  });

  it("does not offer setup steps when Search Console ran but stored no summary", () => {
    renderPage({ ...scanned, search: { state: "ok", summary: null } });
    const gsc = screen.getByRole("region", { name: "Search Console" });
    expect(gsc).toHaveTextContent("No Search Console data in this scan.");
    expect(within(gsc).queryByRole("link", { name: /How to connect/ })).toBeNull();
  });
});
