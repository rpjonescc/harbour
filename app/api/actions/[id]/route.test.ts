import { eq, sql } from "drizzle-orm";
import { actionEventsFor, insertAction, setStatus } from "@/lib/actions/store";
import { getConfig } from "@/lib/config";
import { actions, auditLog } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), db: undefined as unknown }));
vi.mock("@/lib/auth/guard", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: () => mocks.db,
}));
vi.mock("@/lib/products/catalog", () => ({
  getProducts: () => [
    { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" },
  ],
}));

const ORIGIN = "https://harbour.example.ts.net";
const t0 = new Date("2026-10-02T09:00:00Z");
const db = () => mocks.db as ReturnType<typeof openTestDb>;
const post = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  [
    new Request(`${ORIGIN}/api/actions/${id}`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ] as const;
const send = (id: string | number, body: unknown, headers?: Record<string, string>) =>
  POST(...post(String(id), body, headers));
const audits = () =>
  db()
    .select()
    .from(auditLog)
    .all()
    .map((e) => [e.event, e.detail]);
const statusOf = (id: number) =>
  db().select().from(actions).where(eq(actions.id, id)).get()?.status;
/** A date `days` after today in Harbour's time zone. */
const daysAhead = (days: number) =>
  isoDateIn(getConfig().HARBOUR_TIMEZONE, new Date(Date.now() + days * 86_400_000));

function seed(over: Parameters<typeof ruleAction>[0] = {}): number {
  return insertAction(db(), ruleAction(over), "scan", null, t0);
}

describe("POST /api/actions/[id]", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
  });
  afterEach(() => vi.resetAllMocks());

  it("rejects cross-site and non-JSON requests before anything else", async () => {
    const id = seed();
    const change = { from: "open", to: "done" };
    expect((await send(id, change, { origin: "https://elsewhere.example" })).status).toBe(403);
    expect((await send(id, change, { "content-type": "text/plain" })).status).toBe(415);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(statusOf(id)).toBe("open");
  });

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const id = seed();
    const response = await send(id, { from: "open", to: "done" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(statusOf(id)).toBe("open");
  });

  it.each(["0", "-1", "1.5", "abc", "1e2", "9007199254740993"])("400s for id %s", async (id) => {
    const response = await send(id, { from: "open", to: "done" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_id" });
  });

  it.each([
    ["no body", null],
    ["no target", { from: "open" }],
    ["no from", { to: "done" }],
    ["suggested is not a target", { from: "open", to: "suggested" }],
    ["unknown from", { from: "lost", to: "done" }],
    ["extra key", { from: "open", to: "done", status: "done" }],
    ["long note", { from: "open", to: "done", note: "x".repeat(501) }],
    ["until not a date", { from: "open", to: "snoozed", until: "next week" }],
    ["until not zero-padded", { from: "open", to: "snoozed", until: "2026-1-5" }],
  ])("400s for a malformed body (%s)", async (_label, body) => {
    const id = seed();
    const response = await send(id, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(statusOf(id)).toBe("open");
  });

  it("404s for a missing action or one whose product is not configured", async () => {
    const other = seed({ productId: "retired-product" });
    expect((await send(999, { from: "open", to: "done" })).status).toBe(404);
    expect((await send(other, { from: "open", to: "done" })).status).toBe(404);
    expect(statusOf(other)).toBe("open");
  });

  it("409s for a move the status does not allow, and a snooze without a date", async () => {
    const id = seed({ status: "done" });
    const notAllowed = await send(id, { from: "done", to: "in_progress" });
    expect(notAllowed.status).toBe(409);
    expect(await notAllowed.json()).toEqual({ error: "not_allowed" });
    const open = seed({ ruleKey: "thin-content" });
    const noDate = await send(open, { from: "open", to: "snoozed" });
    expect(noDate.status).toBe(409);
    expect(await noDate.json()).toEqual({ error: "until_required" });
    expect(audits()).toEqual([]);
  });

  it.each([
    ["today", () => daysAhead(0)],
    ["an impossible date", () => "2026-13-01"],
  ])("409s until_invalid for a snooze until %s", async (_label, until) => {
    const id = seed();
    const response = await send(id, { from: "open", to: "snoozed", until: until() });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "until_invalid" });
    expect(statusOf(id)).toBe("open");
    expect(audits()).toEqual([]);
  });

  it("accepts an analyst's suggestion (suggested → open)", async () => {
    const id = insertAction(
      db(),
      agentAction(analystJob(db()), "Add a pricing FAQ"),
      "agent",
      null,
      t0,
    );
    const response = await send(id, { from: "suggested", to: "open" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id, status: "open", snoozedUntil: null });
    expect(audits()).toEqual([
      ["action_status_changed", { id, actor: "owner", from: "suggested", to: "open", until: null }],
    ]);
  });

  it("409s stale when the page showed an older status, without overwriting it", async () => {
    const id = seed();
    setStatus(db(), id, "open", "done", { actor: "scan", now: t0 });
    const response = await send(id, { from: "open", to: "dismissed" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stale" });
    expect(statusOf(id)).toBe("done");
    expect(audits()).toEqual([]);
  });

  it("changes the status with an owner event and an audit entry without the note", async () => {
    const id = seed();
    const response = await send(id, { from: "open", to: "in_progress", note: "  Starting  " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id, status: "in_progress", snoozedUntil: null });
    expect(statusOf(id)).toBe("in_progress");
    expect(actionEventsFor(db(), id).at(-1)).toMatchObject({
      actor: "owner",
      from: "open",
      to: "in_progress",
      note: "Starting",
    });
    expect(audits()).toEqual([
      [
        "action_status_changed",
        { id, actor: "owner", from: "open", to: "in_progress", until: null },
      ],
    ]);
    expect(JSON.stringify(audits())).not.toContain("Starting");
  });

  it("leaves the status unchanged when the audit write fails", async () => {
    const id = seed();
    db().run(
      sql.raw(
        "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'audit failed'); END;",
      ),
    );
    await expect(send(id, { from: "open", to: "done" })).rejects.toThrow("audit failed");
    expect(statusOf(id)).toBe("open");
    expect(actionEventsFor(db(), id)).toHaveLength(1);
  });

  it("stores the snooze date", async () => {
    const id = seed();
    const until = daysAhead(7);
    const response = await send(id, { from: "open", to: "snoozed", until });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id, status: "snoozed", snoozedUntil: until });
    expect(db().select().from(actions).where(eq(actions.id, id)).get()).toMatchObject({
      status: "snoozed",
      snoozedUntil: until,
    });
    expect(audits()).toEqual([
      ["action_status_changed", { id, actor: "owner", from: "open", to: "snoozed", until }],
    ]);
    expect(actionEventsFor(db(), id).at(-1)?.note).toBeNull();
  });
});
