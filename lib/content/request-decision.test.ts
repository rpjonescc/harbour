import { auditLog } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { seedPieces } from "@/tests/helpers/chain";
import { ACME, pieceFile } from "@/tests/helpers/content";
import { openTestDb } from "@/tests/helpers/db";
import type { DecisionBody } from "./decision";
import { requestContent } from "./request";
import { MAX_PENDING_DECISIONS } from "./request-decision";

const config = {
  HARBOUR_CONTENT: "on",
  HARBOUR_TIMEZONE: "Australia/Brisbane",
  HARBOUR_CONTENT_DAILY_RUNS: 24,
} as never;
const IDEA = "acme-docs-20261001-five-minutes";
const PIECE = `${IDEA}.linkedin`;

function brain(over: Record<string, unknown> = {}) {
  const files = seedPieces(IDEA, { state: "ready", ...over });
  return makeBrain(files);
}
function ctx(root: string, extra: Record<string, unknown> = {}) {
  return {
    db: openTestDb(),
    config: { ...(config as object), ...extra } as never,
    login: "owner@example.com",
    now: new Date("2026-10-02T02:00:00Z"),
    root,
    products: [ACME],
  };
}
const approve: Extract<DecisionBody, { action: "approve" }> = {
  action: "approve",
  pieceId: PIECE,
  revision: 1,
  checkedFlags: [],
  confirmOpen: false,
};
const ask = (body: object, over: Record<string, unknown> = {}) => {
  const b = brain(over);
  try {
    const c = ctx(b.root);
    return { result: requestContent(c, body as never), c };
  } finally {
    b.cleanup();
  }
};

describe("requestContent: decisions", () => {
  it("queues one content-decision job with string params, audits it, and a second click returns the same job", () => {
    const b = brain();
    try {
      const c = ctx(b.root);
      const first = requestContent(c, approve);
      const second = requestContent(c, approve);
      expect(first).toMatchObject({ ok: true });
      expect(second).toEqual(first);
      expect(listJobs(c.db).map((j) => [j.kind, j.params])).toEqual([
        ["content-decision", { action: "approve", pieceId: PIECE, revision: "1", flags: "" }],
      ]);
      expect(c.db.select().from(auditLog).all()).toMatchObject([
        {
          event: "content_decided",
          detail: { action: "approve", pieceId: PIECE, fromState: "ready", flagsChecked: [] },
        },
      ]);
    } finally {
      b.cleanup();
    }
  });

  it.each([
    ["a stale revision", { ...approve, revision: 9 }, {}, 409, "stale"],
    ["an unticked flag", approve, { flags: ["pricing"] }, 400, "flags_unchecked"],
    [
      "an unconfirmed Needs you piece",
      approve,
      { state: "needs-you", needsYou: "The humanizer check still found 1 pattern." },
      400,
      "confirm_needed",
    ],
    [
      "an unknown piece",
      { ...approve, pieceId: "acme-docs-20261001-nope.linkedin" },
      {},
      404,
      "not_found",
    ],
    [
      "an idea of no product",
      { action: "discard", ideaId: "other-20261001-x" },
      {},
      404,
      "not_found",
    ],
    ["an already approved piece", approve, { state: "approved" }, 409, "not_approvable"],
    [
      "an already discarded piece",
      { action: "discard", pieceId: PIECE, revision: 1 },
      { state: "discarded" },
      409,
      "already_discarded",
    ],
    [
      "an edit that is too long",
      { action: "edit", pieceId: PIECE, revision: 1, body: "a".repeat(3301) },
      {},
      400,
      "too_long",
    ],
    [
      "an edit of an approved piece",
      { action: "edit", pieceId: PIECE, revision: 1, body: "Words." },
      { state: "approved" },
      409,
      "not_editable",
    ],
  ])("refuses %s", (_label, body, over, status, error) => {
    const { result, c } = ask(body, over);
    expect(result).toMatchObject({ ok: false, status, error });
    expect(listJobs(c.db)).toEqual([]);
    expect(c.db.select().from(auditLog).all()).toEqual([]);
  });

  it("refuses a stub, which cannot be approved", () => {
    const b = makeBrain({
      ...seedPieces(IDEA),
      [`content/pieces/${IDEA}/linkedin.md`]: pieceFile(IDEA, "linkedin", {
        state: "needs-you",
        needsYou: "This piece wasn't written.",
        content: null,
      }),
    });
    try {
      expect(requestContent(ctx(b.root), { ...approve, confirmOpen: true })).toMatchObject({
        ok: false,
        error: "not_approvable",
      });
    } finally {
      b.cleanup();
    }
  });

  it("needs only the machine on, not the Claude token, because no model runs", () => {
    const b = brain();
    try {
      expect(
        requestContent(ctx(b.root, { HARBOUR_CLAUDE_OAUTH_TOKEN: undefined }), approve),
      ).toMatchObject({ ok: true });
      expect(requestContent(ctx(b.root, { HARBOUR_CONTENT: "off" }), approve)).toMatchObject({
        ok: false,
        error: "content_off",
      });
    } finally {
      b.cleanup();
    }
  });

  it("never puts the edited text in the audit detail, though it is in the job's params", () => {
    const b = brain();
    try {
      const c = ctx(b.root);
      requestContent(c, {
        action: "edit",
        pieceId: PIECE,
        revision: 1,
        body: "My own words here.",
      });
      expect(JSON.stringify(c.db.select().from(auditLog).all()[0]?.detail)).not.toContain(
        "My own words",
      );
      expect(listJobs(c.db)[0]?.params.body).toBe("My own words here.");
    } finally {
      b.cleanup();
    }
  });

  it("discards an idea by id, without a revision", () => {
    const b = brain();
    try {
      const c = ctx(b.root);
      expect(requestContent(c, { action: "discard", ideaId: IDEA })).toMatchObject({ ok: true });
      expect(listJobs(c.db)[0]?.params).toEqual({ action: "discard", ideaId: IDEA });
    } finally {
      b.cleanup();
    }
  });

  it("refuses an idea that is already discarded with every piece", () => {
    const idea = `content/ideas/acme-docs/${IDEA}.md`;
    const files = seedPieces(IDEA, { state: "discarded" });
    const b = makeBrain({
      ...files,
      [idea]: (files[idea] ?? "").replace("state: drafted", "state: discarded"),
    });
    try {
      expect(requestContent(ctx(b.root), { action: "discard", ideaId: IDEA })).toMatchObject({
        ok: false,
        error: "already_discarded",
      });
    } finally {
      b.cleanup();
    }
  });

  it("bounds the decisions waiting at once, but returns an identical one first", () => {
    const b = brain();
    try {
      const c = ctx(b.root);
      const edit = (text: string) =>
        requestContent(c, { action: "edit", pieceId: PIECE, revision: 1, body: text });
      for (let n = 0; n < MAX_PENDING_DECISIONS; n++)
        expect(edit(`Text ${n}.`)).toMatchObject({ ok: true });
      expect(edit("Text 0.")).toMatchObject({ ok: true });
      expect(edit("One more.")).toMatchObject({ ok: false, status: 429, error: "busy" });
      expect(listJobs(c.db)).toHaveLength(MAX_PENDING_DECISIONS);
    } finally {
      b.cleanup();
    }
  });

  it("says the brain could not be read, queueing nothing, when the pieces folder is not readable", () => {
    const b = makeBrain({ [`content/pieces/${IDEA}`]: "a file where a folder should be" });
    try {
      const c = ctx(b.root);
      expect(requestContent(c, approve)).toMatchObject({ ok: false, error: "brain_unreadable" });
      expect(listJobs(c.db)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });
});
