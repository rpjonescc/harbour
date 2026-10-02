import {
  approveProblem,
  DecisionBody,
  editedOutcome,
  MAX_EDIT_CHARS,
  tooLongMessage,
} from "./decision";

const PIECE = "acme-docs-20261002-x.linkedin";

describe("DecisionBody", () => {
  it("accepts the three actions", () => {
    for (const body of [
      { action: "approve", pieceId: PIECE, revision: 3 },
      { action: "edit", pieceId: PIECE, revision: 3, body: "New text." },
      { action: "discard", pieceId: PIECE, revision: 3 },
      { action: "discard", ideaId: "acme-docs-20261002-x" },
    ]) {
      expect(DecisionBody.safeParse(body).success).toBe(true);
    }
  });

  it.each([
    ["a path as the piece id", { action: "approve", pieceId: "../x.blog", revision: 3 }],
    ["an extra key", { action: "approve", pieceId: PIECE, revision: 3, state: "approved" }],
    ["an unknown action", { action: "publish", pieceId: PIECE, revision: 3 }],
    ["no target", { action: "discard" }],
    ["a piece without its revision", { action: "discard", pieceId: PIECE }],
    ["both targets", { action: "discard", pieceId: PIECE, revision: 1, ideaId: "a-1" }],
    ["a revision of zero", { action: "approve", pieceId: PIECE, revision: 0 }],
    ["a fractional revision", { action: "approve", pieceId: PIECE, revision: 1.5 }],
    ["an unknown flag", { action: "approve", pieceId: PIECE, revision: 1, checkedFlags: ["x"] }],
    ["an empty edit", { action: "edit", pieceId: PIECE, revision: 1, body: "" }],
    [
      "an over-long edit",
      { action: "edit", pieceId: PIECE, revision: 1, body: "a".repeat(20_001) },
    ],
    ["an object as the text", { action: "edit", pieceId: PIECE, revision: 1, body: { a: 1 } }],
    ["an array as the text", { action: "edit", pieceId: PIECE, revision: 1, body: ["a"] }],
    ["a revision sent as text", { action: "approve", pieceId: PIECE, revision: "1" }],
  ])("refuses %s", (_label, body) => {
    expect(DecisionBody.safeParse(body).success).toBe(false);
  });
});

describe("approveProblem", () => {
  const ready = {
    state: "ready" as const,
    flags: [] as ("pricing" | "legal")[],
    hasContent: true,
    needsYou: null,
  };
  const none = { checkedFlags: [], confirmOpen: false };

  it("approves a ready piece with nothing to tick", () => {
    expect(approveProblem(ready, none)).toBeNull();
  });

  it("needs every flag ticked", () => {
    const flagged = { ...ready, flags: ["pricing", "legal"] as ("pricing" | "legal")[] };
    expect(approveProblem(flagged, { ...none, checkedFlags: ["pricing"] })).toBe(
      "Tick every flag before approving.",
    );
    expect(approveProblem(flagged, { ...none, checkedFlags: ["pricing", "legal"] })).toBeNull();
  });

  it("needs a confirmation, naming what is open, for a Needs you piece", () => {
    const open = { ...ready, state: "needs-you" as const };
    const why = "The humanizer check still found 1 pattern.";
    expect(approveProblem({ ...open, needsYou: why }, none)).toBe(`Approve anyway? ${why}`);
    expect(approveProblem(open, { ...none, confirmOpen: true })).toBeNull();
  });

  it("refuses a piece that wasn't written and one in a state that cannot be approved", () => {
    const sure = { ...none, confirmOpen: true };
    expect(approveProblem({ ...ready, hasContent: false }, sure)).toMatch(/wasn't written/);
    for (const state of ["approved", "discarded", "drafting"] as const) {
      expect(approveProblem({ ...ready, state }, sure)).toMatch(/can't be approved/);
    }
  });
});

describe("editedOutcome", () => {
  const prior = { slop: "pass", humanizer: "revised", facts: "pass", platform: "pass" } as const;

  it("is ready when the fresh checks pass, keeping the earlier skill results as they were", () => {
    expect(editedOutcome(prior, [], [])).toEqual({
      state: "ready",
      needsYou: null,
      gates: { slop: "pass", humanizer: "revised", facts: "pass", platform: "pass" },
    });
  });

  it("is not held back by an earlier skill result: the skills are not re-run on the owner's words", () => {
    const failed = { ...prior, humanizer: "fail" } as const;
    expect(editedOutcome(failed, [], [])).toMatchObject({
      state: "ready",
      gates: { humanizer: "fail" },
    });
  });

  it("is Needs you with a plain sentence when a fresh check fails", () => {
    const facts = [{ pattern: "Number not in the source", quote: "40", fix: "Remove the number" }];
    const bad = editedOutcome(prior, facts, []);
    expect(bad).toMatchObject({ state: "needs-you", gates: { facts: "fail", platform: "pass" } });
    expect(bad.needsYou).toMatch(/don't trace to your notes/);
    const hook = [
      { pattern: "Hook too long", quote: "x", fix: "Shorten the first line by 10 characters" },
    ];
    expect(editedOutcome(prior, [], hook).needsYou).toBe(
      "This piece doesn't fit its platform yet: Shorten the first line by 10 characters.",
    );
  });

  it("keeps an open question in Needs you", () => {
    expect(editedOutcome(prior, [], [], ["Is this price right?"])).toMatchObject({
      state: "needs-you",
      needsYou: "A question for you: Is this price right?",
    });
  });

  it("caps an edit at each platform's own hard limit, in plain words", () => {
    expect(MAX_EDIT_CHARS.linkedin).toBe(3000);
    expect(MAX_EDIT_CHARS.facebook).toBe(1500);
    expect(tooLongMessage("linkedin")).toBe(
      "That is longer than LinkedIn allows (3,000 characters). Shorten it and try again.",
    );
  });
});
