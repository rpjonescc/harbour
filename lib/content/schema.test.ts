import { renderFile } from "./files";
import { gateEntrySchema, ideaFrontmatter, parsePieceFile } from "./schema";

// Inline until tests/helpers/content.ts exists (Task 3); Task 11 swaps in its PIECES.
const PIECES = { linkedin: { text: "Docs that ship in five minutes.", hashtags: ["#docs"] } };

const idea = {
  title: "Five minutes",
  kind: "content-idea",
  productId: "acme-docs",
  state: "idea",
  pillar: null,
  angle: "a",
  audienceQuestion: "b",
  why: "c",
  sources: ["product:acme-docs"],
  needsYou: null,
  created: "2026-10-02",
  createdBy: "job-1",
};
const piece = (over: Record<string, unknown> = {}) =>
  renderFile(
    {
      title: "T",
      kind: "content-piece",
      ideaId: "acme-docs-20261002-x",
      productId: "acme-docs",
      platform: "linkedin",
      state: "drafting",
      revision: 1,
      gates: { slop: "pending", humanizer: "pending", facts: "pending", platform: "pending" },
      flags: [],
      claims: [],
      needsYou: null,
      edited: false,
      approvedAt: null,
      content: PIECES.linkedin,
      ...over,
    },
    "Body.",
  );

describe("frontmatter schemas", () => {
  it.each([
    ["a bad ref", { ...idea, sources: ["https://attacker.example"] }],
    ["a smuggled key", { ...idea, approvedBy: "agent" }],
    ["an unknown state", { ...idea, state: "approved" }],
    ["a missing source", { ...idea, sources: [] }],
  ])("rejects an idea with %s", (_label, value) =>
    expect(ideaFrontmatter.safeParse(value).success).toBe(false),
  );

  it("accepts a valid idea, defaulting needsYou", () => {
    const { needsYou: _unused, ...rest } = idea;
    expect(ideaFrontmatter.parse(rest).needsYou).toBeNull();
  });

  it("parses a piece, a stub with null content, and rejects content that does not fit its platform", () => {
    expect(parsePieceFile(piece()).ok).toBe(true);
    expect(
      parsePieceFile(
        piece({ content: null, state: "needs-you", needsYou: "This piece wasn't written." }),
      ),
    ).toMatchObject({ ok: true, value: { content: null } });
    expect(parsePieceFile(piece({ content: { ...PIECES.linkedin, extra: 1 } })).ok).toBe(false);
    expect(parsePieceFile(piece({ platform: "x" })).ok).toBe(false); // linkedin content on an X piece
    expect(parsePieceFile(piece({ approved: true })).ok).toBe(false);
  });

  it("allows only attempt 1 or 2 in a gate entry", () => {
    const entry = {
      gate: "facts",
      order: 3,
      attempt: 2,
      result: "pass",
      findings: [],
      questions: [],
      jobId: 1,
      at: "t",
      textBefore: `sha256:${"a".repeat(64)}`,
      textAfter: `sha256:${"a".repeat(64)}`,
    };
    expect(gateEntrySchema.safeParse(entry).success).toBe(true);
    expect(gateEntrySchema.safeParse({ ...entry, attempt: 3 }).success).toBe(false);
  });
});
