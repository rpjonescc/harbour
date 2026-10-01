import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { reindexAll } from "./indexer";
import { searchBrain, splitSnippet, toMatchQuery } from "./search";

describe("toMatchQuery", () => {
  it("keeps only words, quotes them and adds prefix matching", () => {
    expect(toMatchQuery('perplex "cit*" OR -x')).toBe('"perplex"* "cit"* "OR"* "x"*');
  });
  it("returns null for input with no words", () => {
    expect(toMatchQuery("  *** ")).toBeNull();
  });
  it("caps the number of tokens", () => {
    expect(toMatchQuery("a b c d e f g h i j")?.split(" ")).toHaveLength(8);
  });
});

describe("splitSnippet", () => {
  it("splits on highlight markers", () => {
    expect(splitSnippet("before \u0002hit\u0003 after")).toEqual([
      { text: "before ", hit: false },
      { text: "hit", hit: true },
      { text: " after", hit: false },
    ]);
  });
});

describe("searchBrain", () => {
  it("finds documents by prefix and highlights matches without trusting HTML", () => {
    const brain = makeBrain({ "a.md": "# Alpha\nPerplexity <b>cites</b> sources." });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      const [hit] = searchBrain(db, "perplex");
      expect(hit?.path).toBe("a.md");
      expect(hit?.title).toBe("Alpha");
      expect(hit?.snippet.some((part) => part.hit && /perplexity/i.test(part.text))).toBe(true);
      expect(hit?.snippet.map((p) => p.text).join("")).toContain("<b>cites</b>");
    } finally {
      brain.cleanup();
    }
  });

  it("returns at most twenty hits even when a larger limit is requested", () => {
    const files = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`${index}.md`, "# Title\nneedle"]),
    );
    const brain = makeBrain(files);
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      expect(searchBrain(db, "needle", 100)).toHaveLength(20);
    } finally {
      brain.cleanup();
    }
  });
});
