import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { coverage, times } from "@/tests/helpers/coverage";
import {
  ACME_CRAWL,
  ALL_OK,
  crawlSite,
  errorPage,
  htmlPage,
  readiness,
} from "@/tests/helpers/scoring";
import { RULES } from "./issue-rules";
import { byImpact, deriveIssues, evaluateRules, type RuleOutcome } from "./issues";
import { collectorLabel } from "./labels";
import type { CollectorStatus, ScanObservation } from "./types";

type Statuses = Record<string, CollectorStatus>;

const outcomeOf = (ruleId: string, observations: ScanObservation[], statuses: Statuses = ALL_OK) =>
  evaluateRules(observations, statuses, "news").find((o) => o.ruleId === ruleId);

const stateOf = (ruleId: string, observations: ScanObservation[], statuses?: Statuses) =>
  outcomeOf(ruleId, observations, statuses)?.state;

/** Everything Acme Docs gets right: no rule should fire. */
const CLEAN: ScanObservation[] = [
  htmlPage("/"),
  crawlSite({ brokenInternalLinks: [] }),
  readiness({ robotsTxt: { state: "ok", aiCrawlerAccess: { GPTBot: "allowed" } } }),
  ...coverage(times(10, "indexed")),
];

/** Fixtures for each rule: one where it fires and one where its facts are unknown. */
const CASES: { id: string; present: ScanObservation[]; unknownFacts: ScanObservation[] }[] = [
  {
    id: "missing-title",
    present: [htmlPage("/", { titleLength: 0 })],
    unknownFacts: [errorPage("/missing", 404), crawlSite()],
  },
  {
    id: "missing-description",
    present: [htmlPage("/", { descriptionLength: 0 })],
    unknownFacts: [errorPage("/missing", 404), crawlSite()],
  },
  {
    id: "broken-links",
    present: [crawlSite()],
    unknownFacts: [htmlPage("/")],
  },
  {
    id: "noindex",
    present: [htmlPage("/", { noindex: true })],
    unknownFacts: [crawlSite()],
  },
  {
    id: "ai-crawlers-blocked",
    present: [readiness()],
    unknownFacts: [readiness({ robotsTxt: { state: "unavailable", aiCrawlerAccess: null } })],
  },
  {
    id: "no-faq-schema",
    present: [htmlPage("/"), readiness({ schema: { pagesChecked: 3, pagesWith: { FAQPage: 0 } } })],
    unknownFacts: [htmlPage("/"), readiness({ schema: null })],
  },
  {
    id: "no-llms-txt",
    present: [readiness({ llmsTxt: { present: false } })],
    unknownFacts: [readiness({ llmsTxt: { present: null } })],
  },
  {
    id: "no-preferred-sources",
    present: [readiness({ preferredSources: { button: false } })],
    unknownFacts: [readiness({ preferredSources: null })],
  },
  {
    id: "pages-not-indexed",
    present: coverage([...times(3, "crawled_not_indexed"), ...times(7, "indexed")]),
    unknownFacts: [crawlSite()],
  },
];

describe("RULES", () => {
  it("has the nine rules, in order, each with a test case", () => {
    expect(RULES.map((r) => r.id)).toEqual(CASES.map((c) => c.id));
  });

  it("links every rule to real research topics", () => {
    const paths = new Set(RESEARCH_TOPICS.map((t) => t.path));
    for (const rule of RULES) {
      expect(rule.docs.length).toBeGreaterThan(0);
      for (const doc of rule.docs) expect(paths).toContain(doc);
    }
  });

  it("records needs, effort and docs per rule", () => {
    const table = Object.fromEntries(RULES.map((r) => [r.id, [r.needs, r.effort, r.docs]]));
    const tech = ["research/seo/technical-seo-checklist.md"];
    const llms = ["research/geo/llms-txt-and-ai-crawlers.md"];
    expect(table).toEqual({
      "missing-title": [["crawler"], "small", tech],
      "missing-description": [["crawler"], "medium", tech],
      "broken-links": [["crawler"], "medium", tech],
      noindex: [["crawler"], "small", tech],
      "ai-crawlers-blocked": [["readiness"], "small", llms],
      "no-faq-schema": [
        ["crawler", "readiness"],
        "medium",
        ["research/aeo/aeo-and-ai-overviews.md"],
      ],
      "no-llms-txt": [["readiness"], "small", llms],
      "no-preferred-sources": [
        ["crawler", "readiness"],
        "small",
        ["research/seo/google-preferred-sources.md"],
      ],
      "pages-not-indexed": [["indexing"], "medium", tech],
    });
  });
});

describe.each(CASES)("rule $id", ({ id, present, unknownFacts }) => {
  const rule = RULES.find((r) => r.id === id);

  it("is present when the scan shows the problem, with the rule's effort and docs", () => {
    const outcome = outcomeOf(id, present);
    expect(outcome?.state).toBe("present");
    if (outcome?.state !== "present") return;
    expect(outcome.issue).toMatchObject({ id, effort: rule?.effort, docs: rule?.docs });
  });

  it("is clear when the scan shows nothing wrong", () => {
    expect(outcomeOf(id, CLEAN)).toEqual({ ruleId: id, state: "clear" });
  });

  it("is unknown when the facts it needs are missing", () => {
    const outcome = outcomeOf(id, unknownFacts);
    expect(outcome?.state).toBe("unknown");
    if (outcome?.state !== "unknown") return;
    expect(outcome.reason).not.toMatch(/did not run ok/);
  });

  it.each(["failed", "not_configured", "skipped"] as const)(
    "is unknown, naming the collector, when a need is %s",
    (status) => {
      for (const need of rule?.needs ?? []) {
        // The problem is in the data, but a collector that did not run ok cannot be trusted.
        expect(outcomeOf(id, present, { ...ALL_OK, [need]: status })).toEqual({
          ruleId: id,
          state: "unknown",
          reason: `${collectorLabel(need)} did not run ok in this scan`,
        });
      }
    },
  );

  it("is unknown when a need has no recorded status", () => {
    const statuses: Statuses = { ...ALL_OK };
    for (const need of rule?.needs ?? []) delete statuses[need];
    expect(stateOf(id, present, statuses)).toBe("unknown");
  });
});

describe("evaluateRules", () => {
  it("returns exactly one outcome per rule, in RULES order", () => {
    for (const observations of [[], CLEAN, [...ACME_CRAWL, readiness()]]) {
      expect(evaluateRules(observations, ALL_OK, "news").map((o) => o.ruleId)).toEqual(
        RULES.map((r) => r.id),
      );
    }
  });

  it("is unknown for every rule without observations or statuses", () => {
    const outcomes = evaluateRules([], {}, "news");
    expect(outcomes.every((o) => o.state === "unknown")).toBe(true);
  });

  it("judges the FAQ rule clear from FAQ microdata on a crawled page", () => {
    const faqPage = htmlPage("/faq", { hasFaqMarkup: true });
    const schema = readiness({ schema: { pagesChecked: 1, pagesWith: { FAQPage: 0 } } });
    expect(stateOf("no-faq-schema", [faqPage, schema])).toBe("clear");
  });

  it("is unknown for the FAQ rule when no page had its schema checked", () => {
    const schema = readiness({ schema: { pagesChecked: 0, pagesWith: { FAQPage: 0 } } });
    expect(stateOf("no-faq-schema", [htmlPage("/"), schema])).toBe("unknown");
  });
});

describe("deriveIssues", () => {
  it("equals the present outcomes' issues, highest impact first", () => {
    const observations = [
      htmlPage("/", { titleLength: 0, descriptionLength: 0 }),
      crawlSite(),
      readiness({ llmsTxt: { present: false } }),
    ];
    const present = evaluateRules(observations, ALL_OK, "news").flatMap((o: RuleOutcome) =>
      o.state === "present" ? [o.issue] : [],
    );
    expect(deriveIssues(observations, ALL_OK, "news")).toEqual([...present].sort(byImpact));
    expect(present.length).toBeGreaterThan(1);
  });
});
