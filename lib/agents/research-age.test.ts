import { makeBrain } from "@/tests/helpers/brain";
import { REFRESH_AFTER_DAYS, staleTopics, type TopicAge, topicAges } from "./research-age";
import { RESEARCH_TOPICS } from "./topics";

const doc = (researched: string) => `---\ntitle: Example\nresearched: ${researched}\n---\n# Body\n`;

describe("topicAges", () => {
  it("reads each topic's researched date, defensively", () => {
    const brain = makeBrain({
      "research/glossary.md": doc("2026-08-01"),
      "research/seo/local-seo.md": "# No frontmatter\n",
      "research/seo/seo-fundamentals.md": "---\nresearched: [not, a, date]\n---\n# Bad\n",
      "research/scoring-rationale.md": "---\nresearched: 2026-02-30\n---\n# Impossible date\n",
      "00-start-here.md": "---\n: : broken yaml\n---\n",
    });
    try {
      const ages = topicAges(brain.root);
      expect(ages).toHaveLength(RESEARCH_TOPICS.length);
      const byId = new Map(ages.map((age) => [age.topicId, age]));
      expect(byId.get("glossary")).toEqual({
        topicId: "glossary",
        title: "Glossary",
        path: "research/glossary.md",
        exists: true,
        researched: "2026-08-01",
      });
      for (const id of ["local-seo", "seo-fundamentals", "scoring-rationale", "start-here"]) {
        expect(byId.get(id), id).toMatchObject({ exists: true, researched: null });
      }
      expect(byId.get("technical-seo-checklist")).toMatchObject({
        exists: false,
        researched: null,
      });
    } finally {
      brain.cleanup();
    }
  });

  it("treats a missing brain as nothing written", () => {
    expect(topicAges("/nonexistent/harbour-example-brain").every((a) => !a.exists)).toBe(true);
  });
});

describe("staleTopics", () => {
  const age = (topicId: string, researched: string | null, exists = true): TopicAge => ({
    topicId,
    title: topicId,
    path: `research/${topicId}.md`,
    exists,
    researched,
  });

  it("is due more than 30 days after the researched date", () => {
    expect(REFRESH_AFTER_DAYS).toBe(30);
    const ages = [age("thirty", "2026-09-01"), age("thirty-one", "2026-08-31")];
    expect(staleTopics(ages, "2026-10-01").map((a) => a.topicId)).toEqual(["thirty-one"]);
  });

  it("counts an unknown date as stale and never refreshes a missing document", () => {
    const ages = [age("unknown", null), age("missing", null, false), age("fresh", "2026-09-30")];
    expect(staleTopics(ages, "2026-10-01").map((a) => a.topicId)).toEqual(["unknown"]);
  });

  it("orders oldest first, unknown dates first of all, and caps at the limit", () => {
    const ages = [
      age("may", "2026-05-01"),
      age("jan", "2026-01-10"),
      age("unknown", null),
      age("mar", "2026-03-01"),
      age("fresh", "2026-09-30"),
    ];
    expect(staleTopics(ages, "2026-10-01").map((a) => a.topicId)).toEqual([
      "unknown",
      "jan",
      "mar",
      "may",
    ]);
    expect(staleTopics(ages, "2026-10-01", 3).map((a) => a.topicId)).toEqual([
      "unknown",
      "jan",
      "mar",
    ]);
  });
});
