import { CHECKED_AT, coverage, NEW_SITEMAP, OLD_SITEMAP, times } from "@/tests/helpers/coverage";
import { ALL_OK, crawlSite } from "@/tests/helpers/scoring";
import { evaluateRules } from "./issues";
import type { CollectorStatus, ScanObservation } from "./types";

const RULE = "pages-not-indexed";
const outcome = (
  observations: ScanObservation[],
  statuses: Record<string, CollectorStatus> = ALL_OK,
) =>
  evaluateRules([crawlSite(), ...observations], statuses, "product").find((o) => o.ruleId === RULE);

describe("rule pages-not-indexed", () => {
  it("is raised at 3 pages and 20% of those checked, as a high-impact SEO action of medium effort", () => {
    const result = outcome(
      coverage([...times(3, "discovered_not_indexed"), ...times(12, "indexed")]),
    );
    expect(result?.state).toBe("present");
    if (result?.state !== "present") return;
    expect(result.issue).toMatchObject({
      id: RULE,
      area: "SEO",
      impact: "high",
      effort: "medium",
      title: "Google hasn't added 3 of your 15 pages to its search results",
      total: 3,
      locations: [
        "https://docs.example.com/p1",
        "https://docs.example.com/p2",
        "https://docs.example.com/p3",
      ],
    });
  });

  it("counts all three not-indexed states, and not blocked or other", () => {
    const states = [
      "discovered_not_indexed",
      "crawled_not_indexed",
      "unknown_to_google",
      ...times(3, "blocked"),
      ...times(3, "other"),
    ] as const;
    expect(outcome(coverage([...states]))?.state).toBe("present");
    expect(outcome(coverage([...states.slice(1)]))?.state).toBe("clear");
  });

  it.each([
    ["2 of 4 pages", [...times(2, "crawled_not_indexed"), ...times(2, "indexed")], "clear"],
    ["3 of 16 pages (19%)", [...times(3, "crawled_not_indexed"), ...times(13, "indexed")], "clear"],
    [
      "3 of 15 pages (20%)",
      [...times(3, "crawled_not_indexed"), ...times(12, "indexed")],
      "present",
    ],
    ["3 of 3 pages", times(3, "unknown_to_google"), "present"],
  ] as const)("judges %s", (_name, states, expected) => {
    expect(outcome(coverage([...states]))?.state).toBe(expected);
  });

  it("judges only pages with a known status: unchecked pages are not counted either way", () => {
    const states = [...times(3, "crawled_not_indexed"), ...times(40, "unknown")];
    expect(outcome(coverage(states, { total: 53 }))?.state).toBe("present");
    expect(outcome(coverage(times(20, "unknown"), { total: 53 }))).toMatchObject({
      state: "unknown",
    });
  });

  it("lists at most 20 example pages and still says how many there are", () => {
    const result = outcome(
      coverage([...times(30, "crawled_not_indexed"), ...times(10, "indexed")]),
    );
    if (result?.state !== "present") throw new Error("expected present");
    expect(result.issue.locations).toHaveLength(20);
    expect(result.issue.total).toBe(30);
  });

  it("waits until Harbour has known the sitemap for 14 days, and says so", () => {
    const states = times(10, "crawled_not_indexed");
    expect(outcome(coverage(states, { seen: NEW_SITEMAP }))).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("14 days"),
    });
    const edge = new Date(Date.parse(CHECKED_AT) - 14 * 24 * 60 * 60_000).toISOString();
    expect(outcome(coverage(states, { seen: edge }))?.state).toBe("present");
    expect(outcome(coverage(states, { seen: OLD_SITEMAP }))?.state).toBe("present");
  });

  it("is clear once the share falls under the threshold, so the action resolves", () => {
    const worse = coverage([...times(5, "crawled_not_indexed"), ...times(5, "indexed")]);
    const better = coverage([...times(1, "crawled_not_indexed"), ...times(9, "indexed")]);
    expect(outcome(worse)?.state).toBe("present");
    expect(outcome(better)).toEqual({ ruleId: RULE, state: "clear" });
  });

  it.each(["failed", "not_configured", "skipped"] as const)(
    "is unknown, never raised, when the indexing check is %s",
    (status) => {
      const bad = coverage(times(10, "crawled_not_indexed"));
      expect(outcome(bad, { ...ALL_OK, indexing: status })?.state).toBe("unknown");
    },
  );

  it("is unknown without any index data, with garbage data, or with a summary but no pages", () => {
    expect(outcome([])?.state).toBe("unknown");
    const garbage = coverage(times(10, "crawled_not_indexed")).map((o) => ({
      ...o,
      value: { nonsense: true },
    }));
    expect(outcome(garbage)?.state).toBe("unknown");
    const summaryOnly = coverage(times(10, "crawled_not_indexed")).filter(
      (o) => o.kind === "index_summary",
    );
    expect(outcome(summaryOnly)?.state).toBe("unknown");
  });

  it("ignores a status whose subject is not a web address", () => {
    const rows = coverage(times(10, "crawled_not_indexed")).map((o) =>
      o.kind === "index_status" ? { ...o, subject: "javascript:alert(1)" } : o,
    );
    expect(outcome(rows)?.state).toBe("unknown");
  });
});
