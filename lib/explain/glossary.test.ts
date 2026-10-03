import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GLOSSARY, type TermId, termsFor } from "./glossary";

/** Every .tsx source under `dir`, tests included (a test may render a Term too). */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const ENTRIES = Object.entries(GLOSSARY) as [TermId, (typeof GLOSSARY)[TermId]][];

describe("glossary", () => {
  it("has a word and a meaning for every term", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
    for (const [id, entry] of ENTRIES) {
      expect(entry.word.trim(), id).not.toBe("");
      expect(entry.meaning.trim(), id).not.toBe("");
    }
  });

  it("says each meaning in one plain sentence of at most 160 characters", () => {
    for (const [id, { meaning }] of ENTRIES) {
      expect(meaning.length, id).toBeLessThanOrEqual(160);
      expect(meaning, id).toMatch(/^[A-Z].*\.$/);
      // One sentence: no full stop, question or exclamation mark before the last character.
      expect(meaning.slice(0, -1), id).not.toMatch(/[.!?](\s|$)/);
    }
  });

  it("keeps codes, setting names and the word scan out of words and meanings", () => {
    for (const [id, { word, meaning }] of ENTRIES) {
      const text = `${word} ${meaning}`;
      expect(text, id).not.toMatch(/\b(SEO|GEO|AEO)\b/);
      expect(text, id).not.toMatch(/HARBOUR_/);
      expect(text, id).not.toMatch(/\b(?:re)?scan/i);
    }
  });

  it("gives every More link a label and a same-site or https address", () => {
    for (const [id, { more }] of ENTRIES) {
      if (!more) continue;
      expect(more.label.trim(), id).not.toBe("");
      expect(more.href, id).toMatch(/^(\/|https:\/\/)/);
    }
  });

  it("knows every word a <Term> in the app asks for", () => {
    const used = ["components", "app"].flatMap(sources).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/<Term\s+id="([^"]+)"/g)].map((m) => ({
        file,
        id: m[1] ?? "",
      })),
    );
    expect(used.length).toBeGreaterThan(0);
    const unknown = used.filter(({ id }) => !Object.hasOwn(GLOSSARY, id));
    expect(unknown).toEqual([]);
  });

  it("lists terms in the order asked, once each", () => {
    const entries = termsFor(["worker", "check", "worker", "draft", "check"]);
    expect(entries).toEqual([GLOSSARY.worker, GLOSSARY.check, GLOSSARY.draft]);
    expect(termsFor([])).toEqual([]);
  });
});
