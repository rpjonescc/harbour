import { importProposals } from "@/lib/agents/proposals";
import { auditLog, proposals } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { POST } from "./[id]/proposals/route";

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
const db = () => mocks.db as ReturnType<typeof openTestDb>;
const post = (body: unknown, origin = ORIGIN) =>
  new Request(`${ORIGIN}/api/products/acme-docs/proposals`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id = "acme-docs") => ({ params: Promise.resolve({ id }) });
const rows = () => db().select().from(proposals).all();

function seed() {
  importProposals(
    db(),
    "acme-docs",
    {
      keywords: [
        { term: "example widgets", intent: "commercial", why: "buyers search it" },
        { term: "widget guide", intent: "informational", why: "top of funnel" },
      ],
      questions: [],
      competitors: [],
    },
    null,
  );
  return rows().map((r) => r.id);
}

describe("POST /api/products/[id]/proposals", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
  });
  afterEach(() => vi.resetAllMocks());

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(post({ action: "approve", proposalId: 1 }), params())).status).toBe(401);
  });

  it("rejects cross-site requests", async () => {
    const response = await POST(
      post({ action: "approve", proposalId: 1 }, "https://elsewhere.example"),
      params(),
    );
    expect(response.status).toBe(403);
  });

  it("404s for an unknown product or proposal", async () => {
    expect((await POST(post({ action: "approve", proposalId: 1 }), params("nope"))).status).toBe(
      404,
    );
    expect((await POST(post({ action: "approve", proposalId: 99 }), params())).status).toBe(404);
  });

  it("rejects malformed bodies", async () => {
    expect((await POST(post({ action: "explode" }), params())).status).toBe(400);
  });

  it("approves and rejects, with an audit entry", async () => {
    const [a, b] = seed();
    expect((await POST(post({ action: "approve", proposalId: a }), params())).status).toBe(200);
    expect((await POST(post({ action: "reject", proposalId: b }), params())).status).toBe(200);
    expect(rows().map((r) => r.status)).toEqual(["approved", "rejected"]);
    expect(
      db()
        .select()
        .from(auditLog)
        .all()
        .map((e) => e.event),
    ).toEqual(["proposal_decided", "proposal_decided"]);
  });

  it("edits a valid value and marks it edited", async () => {
    const [a] = seed();
    const value = { term: "example gadgets", intent: "commercial" };
    const response = await POST(post({ action: "edit", proposalId: a, value }), params());
    expect(response.status).toBe(200);
    const row = rows().find((r) => r.id === a);
    expect(row?.value).toEqual(value);
    expect(row?.edited).toBe(true);
  });

  it("returns 400 invalid_edit for an invalid value", async () => {
    const [a] = seed();
    const response = await POST(
      post({ action: "edit", proposalId: a, value: { term: "", intent: "commercial" } }),
      params(),
    );
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string; message: string };
    expect(json.error).toBe("invalid_edit");
    expect(json.message).not.toBe("");
  });

  it("approves all proposed items of a type", async () => {
    seed();
    const response = await POST(post({ action: "approve-all", type: "keyword" }), params());
    expect(await response.json()).toEqual({ ok: true, count: 2 });
    expect(rows().every((r) => r.status === "approved")).toBe(true);
  });
});
