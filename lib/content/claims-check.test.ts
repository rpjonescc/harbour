import { type ClaimsInput, checkClaims } from "./claims-check";

const base: ClaimsInput = {
  text: "Publish docs in five minutes. Read the guide at https://docs.example.com/start.",
  sourceText: "A first deploy takes about five minutes.",
  factsText: "[brain:products/acme-docs/notes.md]\nThe free plan has three projects.",
  claims: [{ text: "A first deploy takes about five minutes.", trace: "source:p1" }],
  paragraphIds: ["p1", "p2"],
  factRefs: ["product:acme-docs", "brain:products/acme-docs/notes.md"],
  allowedHosts: ["docs.example.com"],
};
const find = (over: Partial<ClaimsInput>) =>
  checkClaims({ ...base, ...over }).findings.map((f) => f.pattern);

describe("checkClaims", () => {
  it("passes a piece whose numbers, links and traces all check out", () => {
    expect(checkClaims(base).findings).toEqual([]);
  });

  it.each([
    ["a year", "Founded in 2019.", "Number not in the source"],
    ["a price", "Only $9 a month.", "Number not in the source"],
    ["a spelled-out number", "Twelve teams use it.", "Number not in the source"],
    ["a percentage", "Cuts time by 40%.", "Number not in the source"],
  ])("fails %s that is in no source", (_label, text, pattern) => {
    expect(find({ text: `${base.text} ${text}` })).toContain(pattern);
  });

  it("accepts a number that is only in the facts pack", () => {
    expect(find({ text: "The free plan has three projects." })).toEqual([]);
  });

  it("fails a link to another host, but not a link to the product's own site or its www form", () => {
    expect(find({ text: "See https://attacker.example/x" })).toContain("Link to another host");
    expect(find({ text: "See www.attacker.example" })).toContain("Link to another host");
    expect(find({ text: "See https://www.docs.example.com/x" })).toEqual([]);
  });

  it.each([
    [
      "a claim with no trace",
      [{ text: "It is loved.", trace: "none" as const }],
      "Claim with no source",
    ],
    [
      "a trace to a paragraph that does not exist",
      [{ text: "A.", trace: "source:p9" as const }],
      "Trace to a paragraph that does not exist",
    ],
    [
      "a trace to a document that does not exist",
      [{ text: "A.", trace: "brain:products/other/notes.md" as const }],
      "Trace to a source that does not exist",
    ],
  ])("fails %s", (_label, claims, pattern) => {
    expect(find({ claims })).toContain(pattern);
  });

  it("collects flags from the claims and the keyword list, without failing for them", () => {
    const result = checkClaims({
      ...base,
      text: `${base.text} It costs $5.`,
      sourceText: `${base.sourceText} It costs $5.`,
      claims: [{ text: "Faster than rivals.", trace: "source:p1", flag: "comparative" }],
    });
    expect(result.findings).toEqual([]);
    expect(result.flags.sort()).toEqual(["comparative", "pricing"]);
  });

  it("caps the findings it reports", () => {
    const claims = Array.from({ length: 30 }, (_, i) => ({
      text: `Claim ${i}.`,
      trace: "none" as const,
    }));
    expect(checkClaims({ ...base, claims }).findings).toHaveLength(20);
  });
});
