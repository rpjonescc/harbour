import { auditLog } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { ACME, ideaFile, VOICE_ACME } from "@/tests/helpers/content";
import { openTestDb } from "@/tests/helpers/db";
import { requestContent } from "./request";

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
    expect(ask({}).result).toMatchObject({ ok: false, error: "voice_missing" });
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
