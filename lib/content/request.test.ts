import { auditLog } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { ACME, ideaFile, VOICE_ACME } from "@/tests/helpers/content";
import { openTestDb } from "@/tests/helpers/db";
import { ContentBody, requestContent } from "./request";

const config = {
  HARBOUR_CONTENT: "on",
  HARBOUR_TIMEZONE: "Australia/Brisbane",
  HARBOUR_CONTENT_DAILY_RUNS: 24,
  HARBOUR_CLAUDE_OAUTH_TOKEN: "t",
  HARBOUR_SCREENPIPE_API_KEY: "k",
} as never;
const NOW = new Date("2026-10-02T02:00:00Z"); // 12:00 on 2 October in Brisbane
const ctx = (over: Record<string, unknown> = {}) => ({
  db: openTestDb(),
  config: { ...(config as object), ...over } as never,
  login: "owner@example.com",
  now: NOW,
  root: "",
  products: [ACME],
});

describe("requestContent: make-digest", () => {
  it("queues yesterday's digest, audits it, and a second click returns the same job and is not audited again", () => {
    const c = ctx();
    const a = requestContent(c, { action: "make-digest" });
    const b = requestContent(c, { action: "make-digest" });
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true, jobIds: a.ok ? a.jobIds : [] });
    expect(listJobs(c.db).map((j) => j.params)).toEqual([{ day: "2026-10-01" }]);
    expect(
      c.db
        .select()
        .from(auditLog)
        .all()
        .map((e) => [e.event, e.detail]),
    ).toEqual([["content_run_requested", { kind: "content-digest" }]]);
  });

  it.each([
    [{ HARBOUR_CONTENT: "off" }, 409, "content_off"],
    [{ HARBOUR_CLAUDE_OAUTH_TOKEN: undefined }, 409, "token_missing"],
    [{ HARBOUR_SCREENPIPE_API_KEY: undefined }, 409, "screenpipe_missing"],
  ])("refuses with %j", (over, status, error) => {
    const c = ctx(over);
    expect(requestContent(c, { action: "make-digest" })).toEqual({ ok: false, status, error });
    expect(listJobs(c.db)).toEqual([]);
  });

  it("refuses past the daily cap with the plain sentence, and audits nothing", () => {
    const c = ctx({ HARBOUR_CONTENT_DAILY_RUNS: 0 });
    expect(requestContent(c, { action: "make-digest" })).toMatchObject({
      ok: false,
      status: 429,
      error: "daily_cap",
      message: "Harbour has done its content work for today. It starts again tomorrow.",
    });
    expect(c.db.select().from(auditLog).all()).toEqual([]);
  });

  it("refuses an action it does not know, even past the type system", () => {
    expect(requestContent(ctx(), { action: "publish" } as never)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("requestContent: find-ideas", () => {
  const waiting = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        `content/ideas/acme-docs/acme-docs-20261001-i${i}.md`,
        ideaFile(),
      ]),
    );
  const ask = (files: Record<string, string>, productId = "acme-docs", over = {}) => {
    const { root, cleanup } = makeBrain(files);
    try {
      const c = { ...ctx(over), root };
      return {
        result: requestContent(c, { action: "find-ideas", productId }),
        jobs: listJobs(c.db),
        c,
      };
    } finally {
      cleanup();
    }
  };

  it("queues an ideas run for a content product that has a voice profile, and audits it", () => {
    const { result, jobs, c } = ask({ "content/voices/acme-docs.md": VOICE_ACME });
    expect(result).toMatchObject({ ok: true });
    expect(jobs.map((j) => [j.kind, j.params])).toEqual([
      ["content-ideas", { productId: "acme-docs" }],
    ]);
    expect(c.db.select().from(auditLog).all()[0]?.detail).toEqual({
      kind: "content-ideas",
      productId: "acme-docs",
    });
  });

  it("refuses an unknown product with 404 and a missing voice profile with voice_missing", () => {
    expect(ask({ "content/voices/acme-docs.md": VOICE_ACME }, "ghost").result).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(ask({}).result).toMatchObject({
      ok: false,
      error: "voice_missing",
      message: "Write Acme Docs's voice profile first. The template is on the Content page.",
    });
  });

  it("leaves an unusable voice profile to the job, which says why", () => {
    expect(ask({ "content/voices/acme-docs.md": "no frontmatter" }).result).toMatchObject({
      ok: true,
    });
  });

  it("refuses at 12 ideas waiting, in the spec's words, and queues nothing", () => {
    const { result, jobs } = ask({ "content/voices/acme-docs.md": VOICE_ACME, ...waiting(12) });
    expect(result).toMatchObject({
      ok: false,
      error: "backlog",
      message: "12 ideas are waiting; skipped",
    });
    expect(jobs).toEqual([]);
  });

  it("still queues at 11 waiting", () => {
    expect(ask({ "content/voices/acme-docs.md": VOICE_ACME, ...waiting(11) }).result).toMatchObject(
      { ok: true },
    );
  });

  it("returns the queued job on a second click and audits once", () => {
    const { root, cleanup } = makeBrain({ "content/voices/acme-docs.md": VOICE_ACME });
    try {
      const c = { ...ctx(), root };
      const body = { action: "find-ideas", productId: "acme-docs" } as const;
      const a = requestContent(c, body);
      expect(requestContent(c, body)).toEqual(a);
      expect(listJobs(c.db)).toHaveLength(1);
      expect(c.db.select().from(auditLog).all()).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("refuses an unreadable ideas folder in plain words instead of crashing", () => {
    const { root, cleanup } = makeBrain({
      "content/voices/acme-docs.md": VOICE_ACME,
      "content/ideas/acme-docs": "a file where the folder should be",
    });
    try {
      const c = { ...ctx(), root };
      expect(requestContent(c, { action: "find-ideas", productId: "acme-docs" })).toMatchObject({
        ok: false,
        error: "brain_unreadable",
      });
      expect(listJobs(c.db)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("keeps the content switch and the Claude token checks", () => {
    expect(
      ask({ "content/voices/acme-docs.md": VOICE_ACME }, "acme-docs", { HARBOUR_CONTENT: "off" })
        .result,
    ).toMatchObject({ ok: false, error: "content_off" });
  });
});

describe("requestContent: write-this", () => {
  const IDEA_ID = "acme-docs-20261002-five-minutes";
  const files = (state = "idea") => ({
    "content/voices/acme-docs.md": VOICE_ACME,
    [`content/ideas/acme-docs/${IDEA_ID}.md`]: ideaFile({ state }),
  });
  const run = (
    brain: Record<string, string>,
    ideaId: string,
    over: Record<string, unknown> = {},
  ) => {
    const { root, cleanup } = makeBrain(brain);
    try {
      const c = { ...ctx(over), root, products: [ACME] };
      return { c, result: requestContent(c, { action: "write-this", ideaId }) };
    } finally {
      cleanup();
    }
  };

  it("queues a draft for an idea, once, and audits it with the idea id", () => {
    const { root, cleanup } = makeBrain(files());
    try {
      const c = { ...ctx(), root, products: [ACME] };
      const a = requestContent(c, { action: "write-this", ideaId: IDEA_ID });
      const b = requestContent(c, { action: "write-this", ideaId: IDEA_ID });
      expect(a).toMatchObject({ ok: true });
      expect(b).toEqual(a);
      expect(listJobs(c.db).map((j) => [j.kind, j.params])).toEqual([
        ["content-draft", { ideaId: IDEA_ID }],
      ]);
      expect(c.db.select().from(auditLog).all()).toHaveLength(1);
      expect(c.db.select().from(auditLog).all()[0]?.detail).toEqual({
        kind: "content-draft",
        productId: "acme-docs",
        ideaId: IDEA_ID,
      });
    } finally {
      cleanup();
    }
  });

  it("returns the queued job even when the daily cap is reached (a double click is not an error)", () => {
    const { root, cleanup } = makeBrain(files());
    try {
      const c = { ...ctx({ HARBOUR_CONTENT_DAILY_RUNS: 1 }), root, products: [ACME] };
      const a = requestContent(c, { action: "write-this", ideaId: IDEA_ID });
      expect(requestContent(c, { action: "write-this", ideaId: IDEA_ID })).toEqual(a);
    } finally {
      cleanup();
    }
  });

  it("refuses an id that is not an idea id before it reaches the handler", () => {
    for (const ideaId of ["../x", "Acme-Docs", "a/b", "", "x".repeat(81)]) {
      expect(ContentBody.safeParse({ action: "write-this", ideaId }).success).toBe(false);
    }
    expect(ContentBody.safeParse({ action: "write-this", ideaId: IDEA_ID, extra: 1 }).success).toBe(
      false,
    );
  });

  it.each([
    ["an idea that does not exist", "acme-docs-20261002-ghost", 404, "not_found"],
    [
      "an idea of a product with no content settings",
      "other-20261002-five-minutes",
      404,
      "not_found",
    ],
    [
      "an id that only starts with the product's name",
      "acme-docs-extra-five-minutes",
      404,
      "not_found",
    ],
  ])("refuses %s", (_label, ideaId, status, error) => {
    const { c, result } = run(files(), ideaId);
    expect(result).toMatchObject({ ok: false, status, error });
    expect(listJobs(c.db)).toEqual([]);
  });

  it("refuses an idea that is already being written, or without a voice profile", () => {
    expect(run(files("drafting"), IDEA_ID).result).toMatchObject({
      ok: false,
      error: "not_an_idea",
    });
    const { "content/voices/acme-docs.md": _voice, ...noVoice } = files();
    expect(run(noVoice, IDEA_ID).result).toMatchObject({ ok: false, error: "voice_missing" });
  });

  it("keeps the content switch, the token check and the daily cap", () => {
    expect(run(files(), IDEA_ID, { HARBOUR_CONTENT: "off" }).result).toMatchObject({
      error: "content_off",
    });
    expect(run(files(), IDEA_ID, { HARBOUR_CLAUDE_OAUTH_TOKEN: undefined }).result).toMatchObject({
      error: "token_missing",
    });
    expect(run(files(), IDEA_ID, { HARBOUR_CONTENT_DAILY_RUNS: 0 }).result).toMatchObject({
      ok: false,
      error: "daily_cap",
    });
  });
});
