import { type Config, parseConfig } from "@/lib/config";
import { auditLog, jobs } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  db: undefined as unknown,
  config: undefined as unknown,
  tracking: undefined as unknown,
}));
vi.mock("@/lib/auth/guard", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  getConfig: () => mocks.config,
}));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: () => mocks.db,
}));
vi.mock("@/lib/products/catalog", () => ({
  getProducts: () => [
    {
      id: "acme-docs",
      name: "Acme Docs",
      url: "https://docs.example.com",
      hue: "amber",
      kind: "product",
    },
  ],
  getTracking: () => mocks.tracking,
}));

const ORIGIN = "https://harbour.example.ts.net";
const env = (more: Record<string, string> = {}): Config =>
  parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: ORIGIN,
    HARBOUR_RP_ID: "harbour.example.ts.net",
    HARBOUR_TIMEZONE: "UTC",
    HARBOUR_TREG_API_KEY: "SENTINEL-key",
    HARBOUR_MONTHLY_BUDGET_AUD: "10",
    ...more,
  });
const db = () => mocks.db as ReturnType<typeof openTestDb>;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/outside-checks`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const queued = () => db().select().from(jobs).all();
const ok = { productId: "acme-docs" };

describe("POST /api/outside-checks", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.config = env();
    mocks.tracking = { queries: ["acme docs"], questions: [], country: "AU", languageCode: "en" };
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
  });
  afterEach(() => vi.resetAllMocks());

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(post(ok));
    expect(response.status).toBe(401);
    expect(queued()).toEqual([]);
  });

  it("rejects cross-site and non-JSON requests before the session is even read", async () => {
    expect((await POST(post(ok, { origin: "https://elsewhere.example" }))).status).toBe(403);
    expect((await POST(post(ok, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  it.each([
    ["an empty body", {}],
    ["an extra key", { productId: "acme-docs", extra: 1 }],
    ["a non-string product", { productId: 5 }],
    ["an empty product", { productId: "" }],
    ["a very long product", { productId: "a".repeat(41) }],
    ["an array", [ok]],
    ["null", null],
    ["not JSON", "{nope"],
  ])("refuses %s as invalid, queueing nothing", async (_name, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(queued()).toEqual([]);
  });

  it("refuses an oversized body", async () => {
    const response = await POST(post(JSON.stringify({ productId: "x".repeat(2_000) })));
    expect(response.status).toBe(413);
  });

  it("refuses an unknown product without echoing it", async () => {
    const response = await POST(post({ productId: "SENTINEL-product" }));
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toBe('{"error":"unknown_product"}');
    expect(queued()).toEqual([]);
  });

  it("queues a check once, audited once, and reports the existing one on a second click", async () => {
    const first = await POST(post(ok));
    expect(first.status).toBe(200);
    const { jobId, created } = (await first.json()) as { jobId: number; created: boolean };
    expect(created).toBe(true);
    expect(queued()).toMatchObject([
      { id: jobId, kind: "outside-check", params: ok, requestedBy: "owner@example.com" },
    ]);
    const again = await POST(post(ok));
    expect(await again.json()).toEqual({ jobId, created: false });
    expect(queued()).toHaveLength(1);
    const audits = db().select().from(auditLog).all();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      event: "outside_check_requested",
      detail: { productId: "acme-docs", jobId },
    });
  });

  it.each([
    ["no searches chosen", () => (mocks.tracking = null), 409, "no_searches"],
    [
      "no key",
      () => (mocks.config = { ...env(), HARBOUR_TREG_API_KEY: undefined }),
      409,
      "key_missing",
    ],
    [
      "no budget",
      () => (mocks.config = env({ HARBOUR_MONTHLY_BUDGET_AUD: "0" })),
      409,
      "budget_used_up",
    ],
  ])(
    "refuses with %s, in plain words and with nothing from the request",
    async (_n, arrange, status, error) => {
      arrange();
      const response = await POST(post(ok));
      expect(response.status).toBe(status);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe(error);
      expect(body.message.length).toBeGreaterThan(20);
      expect(JSON.stringify(body)).not.toMatch(/acme|SENTINEL|HARBOUR_[A-Z_]*=/);
      expect(queued()).toEqual([]);
      expect(db().select().from(auditLog).all()).toEqual([]);
    },
  );

  it("answers 429 for a check made in the last 6 hours", async () => {
    const first = await POST(post(ok));
    const { jobId } = (await first.json()) as { jobId: number };
    // The first check ran; a click right after is too soon.
    db().update(jobs).set({ status: "ok" }).run();
    const second = await POST(post(ok));
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ error: "too_soon" });
    expect(queued().map((j) => j.id)).toEqual([jobId]);
  });
});
