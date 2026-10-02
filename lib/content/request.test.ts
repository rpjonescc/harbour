import { auditLog } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/queue";
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
});

describe("requestContent: make-digest", () => {
  it("queues yesterday's digest, audits it, and a second click returns the same job", () => {
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
    ).toEqual([
      ["content_run_requested", { kind: "content-digest" }],
      ["content_run_requested", { kind: "content-digest" }],
    ]);
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
