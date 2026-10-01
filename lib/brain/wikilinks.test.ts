import { brainHref, buildLinkIndex, extractWikiTargets, resolveWikiLink } from "./wikilinks";

const index = buildLinkIndex([
  "research/glossary.md",
  "research/geo/how-ai-engines-pick-sources.md",
  "archive/old/glossary.md",
]);

describe("resolveWikiLink", () => {
  it("resolves by file name, case-insensitively", () => {
    expect(resolveWikiLink(index, "How-AI-Engines-Pick-Sources")).toEqual({
      path: "research/geo/how-ai-engines-pick-sources.md",
      alternatives: [],
    });
  });

  it("picks the shortest path for ambiguous names and lists the others", () => {
    expect(resolveWikiLink(index, "glossary")).toEqual({
      path: "research/glossary.md",
      alternatives: ["archive/old/glossary.md"],
    });
  });

  it("resolves path-style links", () => {
    expect(resolveWikiLink(index, "old/glossary")?.path).toBe("archive/old/glossary.md");
  });

  it("returns null when nothing matches", () => {
    expect(resolveWikiLink(index, "missing")).toBeNull();
  });
});

describe("extractWikiTargets", () => {
  it("finds plain and labelled links", () => {
    expect(extractWikiTargets("See [[glossary]] and [[geo/x|the GEO note]].")).toEqual([
      "glossary",
      "geo/x",
    ]);
  });

  it("ignores wiki examples in fenced and inline code", () => {
    expect(extractWikiTargets("`[[inline]]`\n\n```md\n[[fenced]]\n```\n\nSee [[real]].")).toEqual([
      "real",
    ]);
  });
});

describe("brainHref", () => {
  it("encodes each segment", () => {
    expect(brainHref("research/a b.md")).toBe("/brain/research/a%20b.md");
  });
});
