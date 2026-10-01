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
