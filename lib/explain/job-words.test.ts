import type { JobKind } from "@/lib/jobs/queue";
import { ideaWords, jobWords, sentenceCase } from "./job-words";

const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs" },
  { id: "acme-blog", name: "Acme Blog" },
];
const IDEA = "acme-blog-20261001-five-minutes-to-a-first-deploy";

/** One job of every kind (a Record, so a new kind fails the type check until it is worded). */
const EVERY_KIND: Record<JobKind, Record<string, string>> = {
  research: { topic: "glossary", mode: "refresh" },
  discovery: { productId: "acme-docs" },
  "brain-push": {},
  "notes-sync": {},
  scan: { productId: "acme-docs" },
  "outside-check": { productId: "acme-blog" },
  "weekly-analyst": { week: "2026-W40" },
  "daily-note": { stamp: "2026-10-04" },
  backup: { day: "2026-10-04" },
  retention: { day: "2026-10-04" },
  "content-digest": { day: "2026-10-04" },
  "content-ideas": { productId: "acme-blog" },
  "content-draft": { ideaId: IDEA },
  "content-atomise": { ideaId: IDEA },
  "content-gate": { gate: "humanizer", ideaId: IDEA },
  "content-decision": {},
  "content-postiz": { pieceId: `${IDEA}.linkedin` },
};
const words = (kind: JobKind, params: Record<string, string> = EVERY_KIND[kind]) =>
  jobWords({ kind, params }, PRODUCTS);

describe("jobWords", () => {
  it("words a content check by what it checks, never by the skill's name", () => {
    expect(words("content-gate", { gate: "no-ai-slop", ideaId: IDEA })).toEqual({
      done: "checked “five minutes to a first deploy” for AI-sounding writing",
      doing: "checking “five minutes to a first deploy” for AI-sounding writing",
    });
    expect(words("content-gate").done).toBe(
      "checked “five minutes to a first deploy” sounds like you",
    );
    expect(words("content-gate", { gate: "facts", ideaId: IDEA }).done).toBe(
      "checked the facts in “five minutes to a first deploy”",
    );
    expect(words("content-gate", { gate: "other" }).done).toBe("checked a draft");
  });

  it("names the product a check, ideas or outside view ran for", () => {
    expect(words("scan")).toEqual({ done: "checked Acme Docs", doing: "checking Acme Docs" });
    expect(words("outside-check").done).toBe("checked how the web sees Acme Blog");
    expect(words("discovery").doing).toBe("finding ideas for Acme Docs");
    expect(words("content-ideas").done).toBe("found content ideas for Acme Blog");
    expect(words("scan", { productId: "gone" }).done).toBe("checked a product");
  });

  it("names a research note by its title unless the title is a code", () => {
    expect(words("research").done).toBe("updated the research note “Glossary”");
    expect(words("research", { topic: "glossary" }).doing).toBe(
      "writing the research note “Glossary”",
    );
    expect(words("research", { topic: "local-seo" }).done).toBe("wrote a research note");
    expect(words("research", { topic: "llms-txt-and-ai-crawlers" }).done).toBe(
      "wrote a research note",
    );
  });

  it("says every kind in plain lowercase words, with no kind name, code or dash slug", () => {
    for (const kind of Object.keys(EVERY_KIND) as JobKind[]) {
      for (const text of Object.values(words(kind))) {
        expect(text).toMatch(/^[a-z]/);
        if (kind.includes("-")) expect(text).not.toContain(kind);
        expect(text).not.toMatch(/\b(SEO|GEO|AEO|humanizer|no-ai-slop|atomis\w*)\b|\d{4}-/);
      }
    }
  });
});

describe("ideaWords and sentenceCase", () => {
  it("turns an idea id into its words, and starts a sentence with a capital", () => {
    expect(ideaWords(IDEA)).toBe("five minutes to a first deploy");
    expect(sentenceCase("checked Acme Docs")).toBe("Checked Acme Docs");
  });
});
