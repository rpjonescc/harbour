import { auditLog, jobs } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import { openTestDb } from "@/tests/helpers/db";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  db: undefined as unknown,
  scheduled: "on" as "on" | "off",
}));
vi.mock("@/lib/auth/guard", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: () => mocks.db,
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    getConfig: () =>
      actual.parseConfig({
        HARBOUR_ALLOWED_LOGINS: "owner@example.com",
        HARBOUR_ORIGIN: ORIGIN,
        HARBOUR_RP_ID: "harbour.example.ts.net",
        HARBOUR_TIMEZONE: "Europe/London",
        HARBOUR_SCHEDULED_BACKUP: mocks.scheduled,
      }),
  };
});

const ORIGIN = "https://harbour.example.ts.net";
const db = () => mocks.db as ReturnType<typeof openTestDb>;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/backups`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const backupJobs = () => db().select().from(jobs).all();

describe("POST /api/backups", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.scheduled = "on";
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
  });
  afterEach(() => vi.resetAllMocks());

  it("rejects cross-site and non-JSON requests before anything else", async () => {
    expect((await POST(post({}, { origin: "https://elsewhere.example" }))).status).toBe(403);
    expect((await POST(post({}, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(backupJobs()).toEqual([]);
  });

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(post({}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(backupJobs()).toEqual([]);
  });

  it("accepts only an empty body", async () => {
    expect((await POST(post({ day: "2026-01-01" }))).status).toBe(400);
    expect((await POST(post(null))).status).toBe(400);
    expect(backupJobs()).toEqual([]);
  });

  it("queues today's backup once, with an audit entry, and reports an existing one", async () => {
    const day = isoDateIn("Europe/London", new Date());
    const first = await POST(post({}));
    expect(first.status).toBe(200);
    const { jobId, created } = (await first.json()) as { jobId: number; created: boolean };
    expect(created).toBe(true);
    expect(backupJobs()).toMatchObject([
      { id: jobId, kind: "backup", params: { day }, requestedBy: "owner@example.com" },
    ]);
    const again = await POST(post({}));
    expect(await again.json()).toEqual({ jobId, created: false });
    expect(backupJobs()).toHaveLength(1);
    expect(
      db()
        .select()
        .from(auditLog)
        .all()
        .map((e) => [e.event, e.login, e.detail]),
    ).toEqual([
      ["backup_requested", "owner@example.com", { jobId, day }],
      ["backup_requested", "owner@example.com", { jobId, day }],
    ]);
  });

  it("works when scheduled backups are off", async () => {
    mocks.scheduled = "off";
    const response = await POST(post({}));
    expect(response.status).toBe(200);
    expect(backupJobs()).toHaveLength(1);
  });
});
