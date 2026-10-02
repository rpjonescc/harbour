import { SEO_SUB_SCORES } from "@/lib/scan/scoring/seo";
import type { ScanObservation } from "@/lib/scan/types";
import {
  ACME_SCAN,
  crawlSite,
  cwv,
  daysOf,
  entryOf,
  readiness,
  scoreOf,
  searchConsole,
} from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { SEO_EXPLANATIONS } from "./seo";

function explanation(key: string) {
  const found = SEO_EXPLANATIONS.find((e) => e.key === key);
  if (!found) throw new Error(`No explanation for ${key}`);
  return found;
}

/** The real scorer's evidence for `key`, read back through its explanation. */
const lineOf = (observations: ScanObservation[], key: string) =>
  explanation(key).summarise(entryOf(scoreOf(observations), key)?.evidence ?? "");

/** ACME_SCAN with one collector's observations of `kind` swapped for `replacement`. */
const swap = (collector: string, kind: string, replacement: ScanObservation[]) => [
  ...ACME_SCAN.filter((o) => !(o.collector === collector && o.kind === kind)),
  ...replacement,
];
const withSearch = (current: (number | null)[], prior: (number | null)[]) => [
  ...ACME_SCAN.filter((o) => o.collector !== "search-console"),
  ...searchConsole(current, prior),
];

describe("SEO explanations", () => {
  it("explain every SEO sub-score of the current formula, in formula order and in full", () => {
    expect(SEO_EXPLANATIONS.map((e) => e.key)).toEqual(SEO_SUB_SCORES.map((s) => s.key));
    for (const e of SEO_EXPLANATIONS) {
      expect(e.name.trim()).not.toBe("");
      expect(isComplete(e.parts)).toBe(true);
    }
  });

  it.each([
    [
      "seo.technical",
      "5 of 6 pages Harbour visited loaded properly, and 2 link to a page that's missing.",
    ],
    [
      "seo.indexability",
      "Google is allowed in and your sitemap lists 5 pages; 3 of the 4 Harbour tried loaded properly.",
    ],
    ["seo.cwv", "Google's speed test gives your home page 72 out of 100 on a phone."],
    ["seo.searchTrend", "Google showed your pages 18% more often than in the 28 days before."],
  ])("read %s's real evidence in plain words", (key, line) => {
    expect(lineOf(ACME_SCAN, key)).toBe(line);
  });

  it("say when no page links to a missing one", () => {
    const scan = swap("crawler", "site", [crawlSite({ brokenInternalLinks: [] })]);
    expect(lineOf(scan, "seo.technical")).toBe(
      "5 of 6 pages Harbour visited loaded properly, with no links to missing pages.",
    );
  });

  it("say when robots.txt shuts Google out, or the sitemap is missing", () => {
    const blocked = readiness({
      robotsTxt: { state: "ok", valid: true, googlebot: "blocked", aiCrawlerAccess: null },
    });
    expect(lineOf(swap("readiness", "readiness", [blocked]), "seo.indexability")).toBe(
      "Your robots.txt file tells Google to stay out of your site.",
    );
    const noSitemap = readiness({
      sitemap: {
        reachable: false,
        valid: null,
        sitemapsRead: 0,
        urlCount: null,
        partial: false,
        errors: [],
        offOrigin: [],
        datedUrls: 0,
        newestLastmod: null,
        modifiedLast30Days: 0,
      },
    });
    expect(lineOf(swap("readiness", "readiness", [noSitemap]), "seo.indexability")).toBe(
      "Google is allowed in, but your sitemap is missing or broken.",
    );
  });

  it("fall back to real visitors' wait when there is no lab score", () => {
    const scan = swap("pagespeed", "cwv", [cwv({ performanceScore: null })]);
    expect(lineOf(scan, "seo.cwv")).toBe(
      "Real visitors wait about 260 milliseconds for the page to respond to a tap.",
    );
  });

  it("read a falling, flat or empty search trend", () => {
    expect(lineOf(withSearch(daysOf(28, 40), daysOf(28, 50)), "seo.searchTrend")).toBe(
      "Google showed your pages 20% less often than in the 28 days before.",
    );
    expect(lineOf(withSearch(daysOf(28, 50), daysOf(28, 50)), "seo.searchTrend")).toBe(
      "Google showed your pages about as often as in the 28 days before.",
    );
    expect(lineOf(withSearch(daysOf(28, null), daysOf(28, 50)), "seo.searchTrend")).toBe(
      "Google hasn't shown your pages in search for the last 28 days.",
    );
  });

  it("return null for wording they don't know", () => {
    for (const e of SEO_EXPLANATIONS)
      expect(e.summarise("Wording from an older formula")).toBeNull();
  });
});
