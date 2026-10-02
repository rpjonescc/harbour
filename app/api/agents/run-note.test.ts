import { auditLog } from "@/lib/db/schema";
import { claimNextJob, finishJob, getJob, listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { POST as run } from "./run/route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  db: undefined as unknown,
  personality: "warm" as "warm" | "quiet",
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    getConfig: () => ({
      ...actual.getConfig(),
      HARBOUR_CLAUDE_OAUTH_TOKEN: "test-token",
      HARBOUR_TIMEZONE: "Australia/Brisbane",
      HARBOUR_PERSONALITY: mocks.personality,
    }),
  };
});
vi.mock("@/lib/auth/guard", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: () => mocks.db,
}));

const ORIGIN = "https://harbour.example.ts.net";
const db = () => mocks.db as ReturnType<typeof openTestDb>;
const ask = (body: unknown = { kind: "daily-note" }) =>
  run(
    new Request(`${ORIGIN}/api/agents/run`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const jobIds = async (response: Response) =>
  ((await response.json()) as { jobIds: number[] }).jobIds;

describe("POST /api/agents/run: daily note", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.personality = "warm";
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
    vi.useFakeTimers({ toFake: ["Date"] });
    // 15:30 on Friday 2 October 2026 in Brisbane (the mocked HARBOUR_TIMEZONE).
    vi.setSystemTime(new Date("2026-10-02T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("queues a note stamped with the local time, one at a time, and audits it", async () => {
    const first = await jobIds(await ask());
    const second = await jobIds(await ask());
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(getJob(db(), first[0] ?? 0)).toMatchObject({
      kind: "daily-note",
      params: { stamp: "2026-10-02-1530" },
      requestedBy: "owner@example.com",
    });
    expect(db().select().from(auditLog).all()[0]).toMatchObject({
      login: "owner@example.com",
      event: "agent_run_requested",
      detail: { kind: "daily-note", jobIds: first },
    });
  });

  it("never takes the time from the request", async () => {
    const response = await ask({ kind: "daily-note", stamp: "2020-01-01-0000" });
    expect(response.status).toBe(400);
    expect(listJobs(db())).toEqual([]);
  });

  it("is refused with a calm 429 once the day's requests are used", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await jobIds(await ask())).toHaveLength(1);
      const job = claimNextJob(db());
      if (job) finishJob(db(), job.id, "ok", null);
      vi.setSystemTime(Date.now() + 120_000);
    }
    const response = await ask();
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("is refused when the personality is quiet", async () => {
    mocks.personality = "quiet";
    const response = await ask();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "personality_quiet" });
    expect(listJobs(db())).toEqual([]);
  });
});
