import { eq } from "drizzle-orm";
import { MOVE_REFUSAL } from "@/lib/actions/move-refusal";
import { actionEventsFor, insertAction } from "@/lib/actions/store";
import { actions, auditLog } from "@/lib/db/schema";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { POST } from "./route";

// Moves between board columns through the same route as status changes.

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
const t0 = new Date("2026-10-02T09:00:00Z");
const PR = "https://github.com/acme/widget/pull/42";
const db = () => mocks.db as ReturnType<typeof openTestDb>;
const send = (id: string | number, body: unknown, origin = ORIGIN) =>
  POST(
    new Request(`${ORIGIN}/api/actions/${id}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
const rowOf = (id: number) => db().select().from(actions).where(eq(actions.id, id)).get();
const seed = (over: Parameters<typeof ruleAction>[0] = {}) =>
  insertAction(db(), ruleAction(over), "scan", null, t0);

describe("POST /api/actions/[id] with a board move", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
  });
  afterEach(() => vi.resetAllMocks());

  it("moves the card as the owner, with the note in history and an audit entry", async () => {
    const id = seed();
    const response = await send(id, { moveFrom: "backlog", moveTo: "queue", note: " Next " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id, column: "queue" });
    expect(rowOf(id)).toMatchObject({ status: "open", stage: "queue" });
    expect(actionEventsFor(db(), id).at(-1)).toMatchObject({
      actor: "owner",
      fromStage: null,
      toStage: "queue",
      note: "Next",
    });
    const audit = db().select().from(auditLog).get();
    expect(audit).toMatchObject({ login: "owner@example.com", event: "action_status_changed" });
  });

  it("accepts a new idea dropped in a column", async () => {
    const id = insertAction(db(), agentAction(analystJob(db()), "Add an FAQ"), "agent", null, t0);
    const response = await send(id, { moveFrom: "backlog", moveTo: "started" });
    expect(response.status).toBe(200);
    expect(rowOf(id)).toMatchObject({ status: "in_progress", stage: "started" });
  });

  it.each([
    ["an unknown column", { moveFrom: "backlog", moveTo: "doing" }],
    ["a status as a column", { moveFrom: "open", moveTo: "queue" }],
    ["no from column", { moveTo: "queue" }],
    ["a mixed body", { from: "open", to: "done", moveFrom: "backlog", moveTo: "done" }],
    ["an extra key", { moveFrom: "backlog", moveTo: "queue", until: "2026-10-09" }],
    ["a long note", { moveFrom: "backlog", moveTo: "queue", note: "x".repeat(501) }],
  ])("400s for %s", async (_label, body) => {
    const id = seed();
    const response = await send(id, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(rowOf(id)?.stage).toBeNull();
  });

  it("404s for a missing card or one of an unconfigured product", async () => {
    const other = seed({ productId: "retired-product" });
    expect((await send(999, { moveFrom: "backlog", moveTo: "queue" })).status).toBe(404);
    const response = await send(other, { moveFrom: "backlog", moveTo: "queue" });
    expect(response.status).toBe(404);
    // The board shows the sentence: "try again" would never help with a card that is gone.
    expect(await response.json()).toEqual({
      error: "not_found",
      message: MOVE_REFUSAL.not_found,
    });
  });

  it("409s a second mover with the plain sentence", async () => {
    const id = seed();
    expect((await send(id, { moveFrom: "backlog", moveTo: "queue" })).status).toBe(200);
    const second = await send(id, { moveFrom: "backlog", moveTo: "done" });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "stale", message: MOVE_REFUSAL.stale });
    expect(rowOf(id)?.stage).toBe("queue");
  });

  it.each([
    ["same_column", {}, { moveFrom: "backlog", moveTo: "backlog" }],
    [
      "has_pull_request",
      { status: "in_progress" as const },
      { moveFrom: "in_review", moveTo: "in_progress" },
    ],
  ])("409s %s with its sentence", async (reason, over, body) => {
    const id = seed(over);
    db().update(actions).set({ prUrl: PR }).run();
    const response = await send(id, body);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: reason,
      message: MOVE_REFUSAL[reason as keyof typeof MOVE_REFUSAL],
    });
  });

  it("refuses a cross-site move before reading the session", async () => {
    const id = seed();
    const response = await send(id, { moveFrom: "backlog", moveTo: "queue" }, "https://x.example");
    expect(response.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(rowOf(id)?.stage).toBeNull();
  });
});
