import { type DraftWork, draftProblem, inventedNumbers } from "./draft-check";
import type { FactItem } from "./facts-pack";

const HOSTS = ["docs.example.com"];
const PACK: FactItem[] = [
  { ref: "product:acme-docs", text: "Acme Docs at https://docs.example.com", truncated: false },
  { ref: "brain:products/acme-docs/notes.md", text: "Three projects.", truncated: false },
];
const words = (n: number) => Array.from({ length: n }, () => "docs").join(" ");
const work = (extra = "", over: Partial<DraftWork> = {}): DraftWork => ({
  title: "A short path",
  paragraphs: Array.from({ length: 5 }, (_, i) => ({
    id: `p${i + 1}`,
    text: i === 0 ? `${words(100)} ${extra}` : words(100),
    facts: [],
  })),
  questions: [],
  ...over,
});

describe("draftProblem", () => {
  it("accepts plain text, a link to the product's own site, and a bare own host", () => {
    expect(draftProblem(work(), PACK, HOSTS)).toBeNull();
    expect(draftProblem(work("See https://docs.example.com/start now."), PACK, HOSTS)).toBeNull();
    expect(draftProblem(work("See www.docs.example.com now."), PACK, HOSTS)).toBeNull();
  });

  it.each([
    ["a bare link elsewhere", "see https://evil.example/x now"],
    ["a bare www host elsewhere", "see www.evil.example now"],
    ["a reference-style link", "[a]: https://evil.example/x"],
    ["a reference definition with no link", "[a]: nowhere"],
    ["a heading", "# Heading here"],
    ["a heading after a line start", "\n# Heading"],
    ["strong text and code", "**bold** `code`"],
    ["strong text glued to a digit", "1**2**"],
    ["underscored strong text", "__bold__ text"],
    ["strike-through", "~~gone~~"],
    ["emphasis", "this is *very* good"],
    ["a quote", "> quoted"],
    ["a list item", "- one\n- two"],
    ["a numbered list item", "1. First"],
    ["a plus list item", "+ item"],
    ["an inline link", "[here](https://docs.example.com)"],
    ["an image", "![x](https://docs.example.com/x.png)"],
    ["markup", "<b>x</b>"],
  ])("rejects a paragraph with %s", (_label, text) => {
    const bad = work("", {
      paragraphs: work().paragraphs.map((p, i) => (i === 0 ? { ...p, text } : p)),
    });
    expect(draftProblem(bad, PACK, HOSTS)).toMatch(/Paragraph 1 must be one line of plain text/);
  });

  it("applies the same rules to the title and to each question", () => {
    expect(draftProblem(work("", { title: "# Big title" }), PACK, HOSTS)).toMatch(/title/);
    expect(draftProblem(work("", { title: "See https://evil.example" }), PACK, HOSTS)).toMatch(
      /title/,
    );
    expect(draftProblem(work("", { questions: ["**Is it so?**"] }), PACK, HOSTS)).toMatch(
      /question/,
    );
    expect(
      draftProblem(work("", { questions: ["Is www.evil.example ours?"] }), PACK, HOSTS),
    ).toMatch(/question/);
  });

  it("allows no link at all when the product has no allowed host", () => {
    expect(draftProblem(work("see https://docs.example.com"), PACK, [])).toMatch(/plain text/);
  });
});

describe("inventedNumbers", () => {
  it("checks the questions too", () => {
    expect(inventedNumbers(work("", { questions: ["Is it 7 or three?"] }), PACK)).toEqual(["7"]);
    expect(inventedNumbers(work("", { questions: ["Is it three?"] }), PACK)).toEqual([]);
  });

  it("reads the wider spelled-out forms", () => {
    expect(inventedNumbers(work("A hundred and forty percent, twenty-five teams."), PACK)).toEqual([
      "100",
      "40",
      "25",
    ]);
  });
});
