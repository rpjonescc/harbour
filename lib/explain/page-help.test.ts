import { GLOSSARY, type TermId } from "./glossary";
import { PAGE_HELP, type PageId } from "./page-help";

const PAGES: PageId[] = [
  "tower",
  "actions",
  "product",
  "content",
  "agents",
  "run",
  "brain",
  "settings",
  "targets",
  "sources",
  "devices",
  "design",
];

const sentence = /^[A-Z].*[.!?]$/;

describe("page help", () => {
  it("has copy for every page and nothing else", () => {
    expect(Object.keys(PAGE_HELP).sort()).toEqual([...PAGES].sort());
  });

  it("says what the page is for, how to read it in 1 to 5 lines, and what to do first", () => {
    for (const page of PAGES) {
      const copy = PAGE_HELP[page];
      expect(copy.purpose, page).toMatch(sentence);
      expect(copy.firstStep, page).toMatch(sentence);
      expect(copy.howToRead.length, page).toBeGreaterThanOrEqual(1);
      expect(copy.howToRead.length, page).toBeLessThanOrEqual(5);
      for (const line of copy.howToRead) expect(line, page).toMatch(sentence);
    }
  });

  it("lists only words the glossary explains, each once", () => {
    for (const page of PAGES) {
      const { terms } = PAGE_HELP[page];
      for (const id of terms) expect(Object.hasOwn(GLOSSARY, id), `${page}: ${id}`).toBe(true);
      expect(new Set(terms).size, page).toBe(terms.length);
    }
  });

  it("gives every glossary word a page where its meaning is listed", () => {
    const listed = new Set(PAGES.flatMap((page) => PAGE_HELP[page].terms));
    const orphans = (Object.keys(GLOSSARY) as TermId[]).filter((id) => !listed.has(id));
    expect(orphans).toEqual([]);
  });

  it("keeps codes, setting names and the word scan out", () => {
    for (const page of PAGES) {
      const { purpose, howToRead, firstStep } = PAGE_HELP[page];
      const text = [purpose, ...howToRead, firstStep].join(" ");
      expect(text, page).not.toMatch(/\b(SEO|GEO|AEO)\b/);
      expect(text, page).not.toMatch(/HARBOUR_|\.env|\.json/);
      expect(text, page).not.toMatch(/\b(?:re)?scan/i);
    }
  });
});
