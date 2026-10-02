import { auditLog, jobs } from "@/lib/db/schema";
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
    {
      id: "acme-docs",
      name: "Acme Docs",
      url: "https://docs.example.com",
      hue: "amber",
      kind: "product" as const,
    },
  ],
}));

const ORIGIN = "https://harbour.example.ts.net";
const db = () => mocks.db as ReturnType<typeof openTestDb>;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/scans`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const scanJobs = () => db().select().from(jobs).all();

describe("POST /api/scans", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
  });
  afterEach(() => vi.resetAllMocks());

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(post({ productId: "acme-docs" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(scanJobs()).toEqual([]);
  });

  it("rejects cross-site and non-JSON requests before anything else", async () => {
    expect(
      (await POST(post({ productId: "acme-docs" }, { origin: "https://elsewhere.example" })))
        .status,
    ).toBe(403);
    expect(
      (await POST(post({ productId: "acme-docs" }, { "content-type": "text/plain" }))).status,
    ).toBe(415);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(scanJobs()).toEqual([]);
  });

  it("rejects malformed bodies and unknown products", async () => {
    expect((await POST(post({}))).status).toBe(400);
    const unknown = await POST(post({ productId: "nope" }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "unknown_product" });
    expect(scanJobs()).toEqual([]);
  });

  it("queues a scan once, with an audit entry, and reports an existing one", async () => {
    const first = await POST(post({ productId: "acme-docs" }));
    expect(first.status).toBe(200);
    const { jobId } = (await first.json()) as { jobId: number };
    expect(scanJobs()).toMatchObject([
      {
        id: jobId,
        kind: "scan",
        params: { productId: "acme-docs" },
        requestedBy: "owner@example.com",
      },
    ]);
    const again = await POST(post({ productId: "acme-docs" }));
    expect(await again.json()).toEqual({ jobId, created: false });
    expect(scanJobs()).toHaveLength(1);
    expect(
      db()
        .select()
        .from(auditLog)
        .all()
        .map((e) => [e.event, e.detail]),
    ).toEqual([
      ["scan_requested", { productId: "acme-docs", jobId, created: true }],
      ["scan_requested", { productId: "acme-docs", jobId, created: false }],
    ]);
  });
});
