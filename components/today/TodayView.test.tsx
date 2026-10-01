// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { sampleToday } from "@/lib/today/sample";
import type { TodaySummary } from "@/lib/today/types";
import { TodayView } from "./TodayView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NOW = new Date("2026-10-01T09:00:00Z");
const renderToday = (today: TodaySummary) =>
  render(<TodayView today={today} now={NOW} timeZone="UTC" locale="en-GB" />);

const real: TodaySummary = {
  isSample: false,
  scannedAt: new Date("2026-10-01T06:04:00Z"),
  scanning: false,
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
      id: "acme-docs:missing-title",
      productId: "acme-docs",
      area: "SEO",
      impact: "high",
      title: "2 pages have no title",
      detail: "Give each page a unique, descriptive <title>.",
    },
  ],
  failures: [{ productId: "acme-docs", collector: "pagespeed", error: "quota exceeded" }],
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

  it("says when the first scan is running", () => {
    renderToday({ ...sampleToday(getProducts()), scanning: true });
    expect(screen.getByText(/scan running/)).toBeInTheDocument();
  });

  it("with scans shows real scores, linked issues and failing sources, without the banner", () => {
    renderToday(real);
    expect(screen.queryByText(/Sample data/)).toBeNull();
    expect(screen.getByText(/last scan 1 Oct 2026, 06:04/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "One thing worth your attention.",
    );
    expect(screen.getByRole("link", { name: "2 pages have no title" })).toHaveAttribute(
      "href",
      "/products/acme-docs#issues",
    );
    expect(
      screen.getByRole("heading", { name: "A source failed in the last scan" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed · Acme Docs/)).toHaveTextContent("quota exceeded");
  });

  it("says so when nothing needs attention", () => {
    renderToday({ ...real, actions: [], failures: [] });
    expect(screen.getByText(/the last scans found no issues/)).toBeInTheDocument();
  });
});
