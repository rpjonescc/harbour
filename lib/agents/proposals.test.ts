import { openTestDb } from "@/tests/helpers/db";
import {
  approveAllProposed,
  decideProposal,
  editProposal,
  importProposals,
  listProposals,
  parseProposals,
} from "./proposals";

const sample = {
  keywords: [
    { term: "Example Widgets", intent: "commercial", why: "Core term" },
    { term: "widgets near me", intent: "local", location: "Springfield", why: "Local intent" },
  ],
  questions: [{ text: "What is the best example widget?", why: "Buyer question" }],
  competitors: [{ name: "Example Rival", url: "https://rival.example.com", why: "Ranks well" }],
};

describe("parseProposals", () => {
  it("accepts the documented shape", () => {
    expect(parseProposals(JSON.stringify(sample)).keywords).toHaveLength(2);
  });
  it("rejects invalid JSON, unknown intents and non-http competitor URLs", () => {
    expect(() => parseProposals("{ nope")).toThrow(/not valid JSON/i);
    expect(() =>
      parseProposals(
        JSON.stringify({ ...sample, keywords: [{ term: "x", intent: "vibes", why: "y" }] }),
      ),
    ).toThrow(/intent/);
    expect(() =>
      parseProposals(
        JSON.stringify({
          ...sample,
          competitors: [{ name: "x", url: "javascript:alert(1)", why: "y" }],
        }),
      ),
    ).toThrow();
  });
});

describe("importing and deciding", () => {
  it("imports as proposed, dedupes case-insensitively, and never overwrites decisions", () => {
    const db = openTestDb();
    const first = importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    expect(first).toEqual({ added: 4, skipped: 0 });

    const keyword = listProposals(db, "acme-docs").keyword.find(
      (p) => p.value.term === "Example Widgets",
    );
    if (!keyword) throw new Error("expected keyword");
    expect(decideProposal(db, "acme-docs", keyword.id, "approved")).toBe(true);

    const again = {
      ...sample,
      keywords: [{ term: "example widgets", intent: "informational", why: "dup" }],
    };
    expect(importProposals(db, "acme-docs", parseProposals(JSON.stringify(again)), null)).toEqual({
      added: 0,
      skipped: 3,
    });
    const after = listProposals(db, "acme-docs").keyword.find((p) => p.id === keyword.id);
    if (!after) throw new Error("expected keyword after");
    expect(after.status).toBe("approved");
    expect(after.value.intent).toBe("commercial");
  });

  it("scopes decisions to the product and validates edits", () => {
    const db = openTestDb();
    importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    const q = listProposals(db, "acme-docs").question[0];
    if (!q) throw new Error("expected question");
    expect(decideProposal(db, "other-product", q.id, "approved")).toBe(false);
    expect(editProposal(db, "acme-docs", q.id, { text: "" })).toMatchObject({ ok: false });
    expect(
      editProposal(db, "acme-docs", q.id, { text: "What does an example widget cost?" }),
    ).toEqual({ ok: true });
    expect(listProposals(db, "acme-docs").question[0]).toMatchObject({
      edited: true,
      value: { text: "What does an example widget cost?" },
    });
  });

  it("approves all proposed items of one type", () => {
    const db = openTestDb();
    importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    expect(approveAllProposed(db, "acme-docs", "keyword")).toBe(2);
    expect(listProposals(db, "acme-docs").keyword.every((p) => p.status === "approved")).toBe(true);
    expect(listProposals(db, "acme-docs").question[0]?.status).toBe("proposed");
  });
});

describe("stricter validation", () => {
  const withCompetitors = (competitors: unknown[]) => JSON.stringify({ ...sample, competitors });

  it("rejects credentials and over-long URLs, strips unknown keys, accepts a BOM", () => {
    expect(() =>
      parseProposals(
        withCompetitors([{ name: "x", url: "https://user:pw@example.com", why: "y" }]),
      ),
    ).toThrow();
    expect(() =>
      parseProposals(
        withCompetitors([{ name: "x", url: `https://example.com/${"a".repeat(2100)}`, why: "y" }]),
      ),
    ).toThrow();
    const parsed = parseProposals(
      `\uFEFF${JSON.stringify({ ...sample, extra: 1, questions: [{ text: "q?", why: "w", junk: true }] })}`,
    );
    expect(parsed.questions[0]).toEqual({ text: "q?", why: "w" });
    expect("extra" in parsed).toBe(false);
  });

  it("rejects over-length strings and oversized arrays", () => {
    expect(() =>
      parseProposals(
        JSON.stringify({ ...sample, questions: [{ text: "q".repeat(301), why: "w" }] }),
      ),
    ).toThrow();
    const many = Array.from({ length: 61 }, (_, i) => ({
      term: `t${i}`,
      intent: "local",
      why: "w",
    }));
    expect(() => parseProposals(JSON.stringify({ ...sample, keywords: many }))).toThrow();
  });

  it("dedupes whitespace and NFKC variants", () => {
    const db = openTestDb();
    importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    const variant = {
      keywords: [{ term: "  ＥXAMPLE   widgets ", intent: "local", why: "dup" }],
      questions: [{ text: "What  is the BEST example widget?", why: "dup" }],
      competitors: [],
    };
    expect(importProposals(db, "acme-docs", parseProposals(JSON.stringify(variant)), null)).toEqual(
      { added: 0, skipped: 2 },
    );
  });

  it("keys competitors by host and path", () => {
    const db = openTestDb();
    const comp = (url: string) => ({
      keywords: [],
      questions: [],
      competitors: [{ name: "C", url, why: "w" }],
    });
    const add = (url: string) =>
      importProposals(db, "acme-docs", parseProposals(JSON.stringify(comp(url))), null).added;
    expect(add("https://example.com/a")).toBe(1);
    expect(add("https://example.com/b")).toBe(1);
    expect(add("https://www.example.com/")).toBe(1);
    expect(add("https://example.com")).toBe(0);
    expect(add("https://EXAMPLE.com/A/")).toBe(0);
  });

  it("handles edit collisions, rejected items and cross-product access", () => {
    const db = openTestDb();
    const two = {
      keywords: [],
      competitors: [],
      questions: [
        { text: "One?", why: "w" },
        { text: "Two?", why: "w" },
      ],
    };
    importProposals(db, "acme-docs", parseProposals(JSON.stringify(two)), null);
    const [a, b] = listProposals(db, "acme-docs").question;
    if (!a || !b) throw new Error("expected two questions");
    expect(editProposal(db, "acme-docs", b.id, { text: "one?" })).toEqual({
      ok: false,
      error: "An item with that value already exists",
    });
    expect(editProposal(db, "other-product", a.id, { text: "Zed?" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(decideProposal(db, "other-product", a.id, "rejected")).toBe(false);

    expect(editProposal(db, "acme-docs", a.id, { text: "Uno?" })).toEqual({ ok: true });
    expect(listProposals(db, "acme-docs").question[0]?.decidedAt).toBeNull();

    decideProposal(db, "acme-docs", a.id, "rejected");
    expect(editProposal(db, "acme-docs", a.id, { text: "Eins?" })).toEqual({
      ok: false,
      error: "rejected items can't be edited",
    });
  });

  it("scopes approve-all to the product", () => {
    const db = openTestDb();
    importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    importProposals(db, "other-product", parseProposals(JSON.stringify(sample)), null);
    expect(approveAllProposed(db, "acme-docs", "keyword")).toBe(2);
    expect(listProposals(db, "other-product").keyword.every((p) => p.status === "proposed")).toBe(
      true,
    );
  });
});
