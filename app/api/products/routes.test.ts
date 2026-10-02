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
      pillars: [],
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

  it("returns 400 when editing a rejected item", async () => {
    const [a] = seed();
    await POST(post({ action: "reject", proposalId: a }), params());
    const response = await POST(
      post({ action: "edit", proposalId: a, value: { term: "x", intent: "local" } }),
      params(),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("invalid_edit");
  });

  it("404s for a proposal that belongs to another product", async () => {
    const [a] = seed();
    expect((await POST(post({ action: "approve", proposalId: a }), params("other"))).status).toBe(
      404,
    );
    expect(rows().find((r) => r.id === a)?.status).toBe("proposed");
  });

  it("reports validation errors as readable field lines", async () => {
    const [a] = seed();
    const response = await POST(
      post({ action: "edit", proposalId: a, value: { term: "", intent: "commercial" } }),
      params(),
    );
    const { message } = (await response.json()) as { message: string };
    expect(message).toMatch(/^term: /);
    expect(message).not.toContain("✖");
  });

  describe("pillar limit", () => {
    const pillar = (key: string) => ({
      key,
      name: key,
      description: "A recurring theme.",
      why: "It comes up often.",
    });
    const seedPillars = (keys: string[]) => {
      importProposals(
        db(),
        "acme-docs",
        { keywords: [], questions: [], competitors: [], pillars: keys.map(pillar) },
        null,
      );
      return rows().map((r) => r.id);
    };

    it("refuses a seventh approved pillar and leaves it proposed", async () => {
      const ids = seedPillars(["a", "b", "c", "d", "e", "f", "g"]);
      for (const id of ids.slice(0, 6)) {
        expect((await POST(post({ action: "approve", proposalId: id }), params())).status).toBe(
          200,
        );
      }
      const seventh = ids[6];
      const response = await POST(post({ action: "approve", proposalId: seventh }), params());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "pillar_limit" });
      expect(rows().find((r) => r.id === seventh)?.status).toBe("proposed");
    });

    it("refuses approve-all for pillars when it would pass six", async () => {
      seedPillars(["a", "b", "c", "d", "e", "f", "g"]);
      const first = rows()[0];
      await POST(post({ action: "approve", proposalId: first?.id }), params());
      const response = await POST(post({ action: "approve-all", type: "pillar" }), params());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "pillar_limit" });
      expect(rows().filter((r) => r.status === "approved")).toHaveLength(1);
    });

    it("lets approve-all through up to six, and re-approving an approved one", async () => {
      const [first] = seedPillars(["a", "b", "c"]);
      await POST(post({ action: "approve", proposalId: first }), params());
      expect((await POST(post({ action: "approve-all", type: "pillar" }), params())).status).toBe(
        200,
      );
      expect((await POST(post({ action: "approve", proposalId: first }), params())).status).toBe(
        200,
      );
    });
  });
});
