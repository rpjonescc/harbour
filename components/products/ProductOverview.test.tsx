// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { OUTSIDE_NOT_CHECKED } from "@/components/design/outside-example-data";
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
  kind: "product" as const,
};
const AT = new Date("2026-10-01T06:04:00Z");

const empty: ProductView = {
  scores: { latest: null, deltas: { seo: null, geo: null, aeo: null }, trend: [] },
  scan: { active: null, last: null },
  formulaChange: null,
  issues: [],
  actionByRule: new Map(),
  pages: { rows: [], total: 0 },
  search: { state: "none", reason: null },
  indexing: { state: "empty", why: "waiting", reason: null },
};

const scanned: ProductView = {
  formulaChange: null,
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
  issues: deriveIssues(
    [
      ...ACME_CRAWL,
      readiness({ robotsTxt: { state: "ok", aiCrawlerAccess: { PerplexityBot: "blocked" } } }),
    ],
    ALL_OK,
    "product",
  ),
  actionByRule: new Map([
    ["broken-links", { id: 5, status: "in_progress", snoozedUntil: null, who: "claude" }],
    ["noindex", { id: 6, status: "snoozed", snoozedUntil: "2026-10-12", who: null }],
  ]),
  pages: pageRows(ACME_CRAWL),
  search: { state: "not_configured", reason: "HARBOUR_GSC_CREDENTIALS is not set" },
  indexing: { state: "empty", why: "not_connected", reason: null },
};

const renderPage = (view: ProductView, productOverrides: Partial<Product> = {}) =>
  render(
    <ProductOverview
      product={{ ...product, ...productOverrides }}
      view={view}
      outside={OUTSIDE_NOT_CHECKED}
      timeZone="UTC"
      locale="en-GB"
    />,
  );

describe("ProductOverview", () => {
  it("shows the scoring note under the area cards for a product site", () => {
    renderPage({ ...scanned, formulaChange: { from: "v1", to: "v2", at: AT } });
    expect(
      screen.getByText("Scoring updated: Preferred Sources now only counts for news sites."),
    ).toBeInTheDocument();
  });

  it("doesn't show it for a news site, whose score did not change", () => {
    renderPage({ ...scanned, formulaChange: { from: "v1", to: "v2", at: AT } }, { kind: "news" });
    expect(screen.queryByText(/Scoring updated/)).toBeNull();
  });

  it("shows the v3 note on a news site too, since v3 changed every kind", () => {
    renderPage({ ...scanned, formulaChange: { from: "v2", to: "v3", at: AT } }, { kind: "news" });
    expect(screen.getByText(/^Scoring updated: FAQ markup, llms.txt/)).toBeInTheDocument();
  });

  it("for a product never checked says so everywhere, with Check now and the research link", () => {
    renderPage(empty);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Acme Docs");
    expect(screen.getByText(/hasn't checked this site yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check now" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Research targets" })).toHaveAttribute(
      "href",
      "/settings/products/acme-docs",
    );
    expect(screen.getByText(/Problems Harbour finds will be listed here\./)).toBeInTheDocument();
    expect(screen.getByText(/The pages Harbour checks will be listed here/)).toBeInTheDocument();
    expect(screen.getAllByText("No score yet")).toHaveLength(3);
  });

  it("shows a running scan and disables Check now", () => {
    renderPage({
      ...empty,
      scan: { active: { jobId: 4, status: "running", since: AT }, last: null },
    });
    expect(screen.getByText(/Checking now \(started 1 Oct 2026, 06:04\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled();
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
    expect(within(broken).getByText("Claude is on it")).toBeInTheDocument();
    expect(
      within(broken).getByRole("link", {
        name: "View on the Actions board: 1 page you link to can't be found",
      }),
    ).toHaveAttribute("href", "/actions?product=acme-docs&status=all#action-5");
    expect(
      within(issue("hidden from search")).getByText("Snoozed until 12 Oct 2026"),
    ).toBeInTheDocument();
    const untracked = issue("AI assistants can't read your site");
    expect(within(untracked).getByText("Tracking starts with the next check")).toBeInTheDocument();
    expect(
      within(untracked).queryByRole("link", {
        name: /^View on the Actions board/,
      }),
    ).toBeNull();
  });

  it("names open, dismissed and done-but-still-found actions", () => {
    const status = (s: "open" | "dismissed" | "done") => ({
      id: 5,
      status: s,
      snoozedUntil: null,
      who: s === "open" ? ("you" as const) : null,
    });
    for (const [s, text] of [
      ["open", "Waiting for you"],
      ["dismissed", "Dismissed"],
      ["done", "Done — still found in the last check"],
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

  it("shows the paid data as not available yet, in plain words", () => {
    renderPage(scanned);
    const names: string[] = [];
    for (const name of ["What AI assistants say about you", "Where you rank on Google"]) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveTextContent("Not available yet");
      expect(region).toHaveTextContent("Harbour doesn't collect this data yet.");
      expect(region.textContent).not.toMatch(/HARBOUR_/);
      const link = within(region).getByRole("link", { name: /What the scores use today/ });
      expect(link).toBeVisible();
      names.push(link.textContent ?? "");
    }
    expect(new Set(names).size).toBe(2);
  });
});
