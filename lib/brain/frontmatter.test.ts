import { splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("parses valid frontmatter and returns the body", () => {
    const text = [
      "---",
      "title: How AI engines pick sources",
      "tags: [geo]",
      "researched: 2026-10-01",
      "confidence: medium",
      "review_by: 2027-01-01",
      "sources: [https://example.com/a]",
      "---",
      "# Body",
    ].join("\n");
    expect(splitFrontmatter(text)).toEqual({
      frontmatter: {
        title: "How AI engines pick sources",
        tags: ["geo"],
        researched: "2026-10-01",
        confidence: "medium",
        review_by: "2027-01-01",
        sources: ["https://example.com/a"],
      },
      body: "# Body",
      frontmatterError: null,
    });
  });

  it("returns the whole text as body when there is no frontmatter", () => {
    expect(splitFrontmatter("# Just text")).toEqual({
      frontmatter: {},
      body: "# Just text",
      frontmatterError: null,
    });
  });

  it("reports invalid values without hiding the body", () => {
    const result = splitFrontmatter("---\nconfidence: certain\n---\nBody");
    expect(result.body).toBe("Body");
    expect(result.frontmatter).toEqual({});
    expect(result.frontmatterError).toMatch(/confidence/);
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.com/a"])(
    "rejects a %s source",
    (source) => {
      const result = splitFrontmatter(`---\nsources: ["${source}"]\n---\nBody`);
      expect(result.frontmatter).toEqual({});
      expect(result.frontmatterError).toMatch(/sources/);
    },
  );

  it("reports broken YAML without hiding the body", () => {
    const result = splitFrontmatter("---\ntags: [unclosed\n---\nBody");
    expect(result.body).toBe("Body");
    expect(result.frontmatterError).toMatch(/YAML/);
  });
});
