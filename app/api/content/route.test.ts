import { listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  db: undefined as unknown,
  content: "on" as "on" | "off",
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    getConfig: () => ({
      ...actual.getConfig(),
      HARBOUR_CONTENT: mocks.content,
      HARBOUR_CLAUDE_OAUTH_TOKEN: "test-token",
      HARBOUR_SCREENPIPE_API_KEY: "test-key",
      HARBOUR_TIMEZONE: "Australia/Brisbane",
    }),
  };
});
vi.mock("@/lib/auth/guard", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: () => mocks.db,
}));

const db = () => mocks.db as ReturnType<typeof openTestDb>;

async function origin() {
  const { getConfig } = await import("@/lib/config");
  return getConfig().HARBOUR_ORIGIN;
}

async function ask(body: unknown, headers: Record<string, string> = {}) {
  const base = await origin();
  return POST(
    new Request(`${base}/api/content`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/content", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.content = "on";
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
  });
  afterEach(() => vi.resetAllMocks());

  it("refuses a cross-site request before looking at anything else", async () => {
    const response = await ask({ action: "make-digest" }, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(listJobs(db())).toEqual([]);
  });

  it("refuses a request with no session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await ask({ action: "make-digest" })).status).toBe(401);
    expect(listJobs(db())).toEqual([]);
  });

  it.each([
    ["not json", "{nope"],
    ["an unknown action", { action: "publish" }],
    ["an extra key", { action: "make-digest", day: "2020-01-01" }],
    ["no body", "null"],
  ])("refuses a bad body: %s", async (_label, body) => {
    expect((await ask(body)).status).toBe(400);
    expect(listJobs(db())).toEqual([]);
  });

  it("refuses a huge body without parsing it, and deeply nested or oddly shaped decisions as invalid", async () => {
    const huge = JSON.stringify({
      action: "edit",
      pieceId: "a-1.x",
      revision: 1,
      body: "a".repeat(200_000),
    });
    expect((await ask(huge)).status).toBe(413);
    expect((await ask("{}", { "content-length": "900000" })).status).toBe(413);
    const deep = `${"[".repeat(5000)}${"]".repeat(5000)}`;
    expect((await ask(deep)).status).toBe(400);
    const piece = "acme-docs-20261001-five-minutes.linkedin";
    for (const body of [
      { action: "edit", pieceId: piece, revision: 1, body: { nested: { deep: "x" } } },
      { action: "edit", pieceId: piece, revision: 1, body: "x".repeat(20_001) },
      { action: "approve", pieceId: piece, revision: 1, state: "approved" },
      { action: "approve", pieceId: "../x.linkedin", revision: 1 },
      { action: "discard", pieceId: piece },
      { action: "discard" },
    ]) {
      expect((await ask(body)).status).toBe(400);
    }
    expect(listJobs(db())).toEqual([]);
  });

  it("queues one digest job and returns its id; a second click returns the same one", async () => {
    const first = (await (await ask({ action: "make-digest" })).json()) as { jobIds: number[] };
    const second = (await (await ask({ action: "make-digest" })).json()) as { jobIds: number[] };
    expect(first.jobIds).toHaveLength(1);
    expect(second.jobIds).toEqual(first.jobIds);
    expect(listJobs(db()).map((j) => j.kind)).toEqual(["content-digest"]);
  });

  it("says so, with a 409, when the content machine is off", async () => {
    mocks.content = "off";
    const response = await ask({ action: "make-digest" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "content_off" });
  });
});
