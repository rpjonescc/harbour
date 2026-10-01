import { MAX_DOCS, MAX_EVIDENCE_ITEMS, readDocs, readEvidence } from "./evidence";

const good = {
  items: [
    { text: "https://example.com/a has no title", url: "https://example.com/a" },
    { text: "Robots blocks GPTBot", url: null },
  ],
  total: 7,
};

describe("readEvidence", () => {
  it("returns valid evidence unchanged", () => {
    expect(readEvidence(good)).toEqual({ evidence: good, invalid: false });
  });

  it.each([
    ["not an object", "oops"],
    ["a missing total", { items: [] }],
    ["an extra field", { ...good, html: "<b>" }],
    ["a javascript: url", { items: [{ text: "x", url: "javascript:alert(1)" }], total: 1 }],
    [
      "a url with credentials",
      { items: [{ text: "x", url: "https://u:p@example.com/" }], total: 1 },
    ],
    ["a url that is not a URL", { items: [{ text: "x", url: "not a url" }], total: 1 }],
    ["text over 300 chars", { items: [{ text: "x".repeat(301), url: null }], total: 1 }],
    ["a total below the item count", { items: good.items, total: 1 }],
    [
      "too many items",
      {
        items: Array.from({ length: MAX_EVIDENCE_ITEMS + 1 }, () => ({ text: "x", url: null })),
        total: 99,
      },
    ],
  ])("treats %s as an empty, flagged gap", (_label, value) => {
    expect(readEvidence(value)).toEqual({ evidence: { items: [], total: 0 }, invalid: true });
  });
});

describe("readDocs", () => {
  it("returns valid brain paths unchanged", () => {
    const docs = ["research/topics/technical-seo-checklist.md"];
    expect(readDocs(docs)).toEqual({ docs, invalid: false });
  });

  it.each([
    ["not an array", { path: "a.md" }],
    ["a parent path", ["../secrets.md"]],
    ["an absolute path", ["/etc/passwd.md"]],
    ["a non-markdown path", ["research/a.txt"]],
    ["too many docs", Array.from({ length: MAX_DOCS + 1 }, (_, i) => `r/${i}.md`)],
  ])("treats %s as an empty, flagged gap", (_label, value) => {
    expect(readDocs(value)).toEqual({ docs: [], invalid: true });
  });
});
