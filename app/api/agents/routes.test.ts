import { auditLog } from "@/lib/db/schema";
import { addEvent, claimNextJob, enqueueJob, getJob, listJobs } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { POST as cancel } from "./[id]/cancel/route";
import { GET as getRun } from "./[id]/route";
import { POST as brainPush } from "./brain-push/route";
import { POST as notesSync } from "./notes-sync/route";
import { POST as run } from "./run/route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  db: undefined as unknown,
  token: "test-token" as string | undefined,
  brainDir: "/nonexistent/harbour-example-brain",
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    getConfig: () => ({
      ...actual.getConfig(),
      HARBOUR_CLAUDE_OAUTH_TOKEN: mocks.token,
      HARBOUR_TIMEZONE: "Australia/Brisbane",
      HARBOUR_BRAIN_DIR: mocks.brainDir,
    }),
  };
});
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
const auditEvents = () => db().select().from(auditLog).all();

const post = (path: string, body: unknown = {}, origin = ORIGIN) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const idParams = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe("agents API routes", () => {
  beforeEach(() => {
    mocks.db = openTestDb();
    mocks.getSession.mockResolvedValue({ login: "owner@example.com" });
    mocks.token = "test-token";
  });
  afterEach(() => vi.resetAllMocks());

  describe("POST /api/agents/run", () => {
    it("requires a session", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await run(post("/api/agents/run", { kind: "research", topic: "all" }))).status).toBe(
        401,
      );
    });

    it("rejects cross-site requests", async () => {
      const response = await run(
        post("/api/agents/run", { kind: "research", topic: "all" }, "https://elsewhere.example"),
      );
      expect(response.status).toBe(403);
      expect(listJobs(db())).toEqual([]);
    });

    it("refuses agent runs while the Claude token is not set", async () => {
      mocks.token = undefined;
      for (const body of [
        { kind: "research", topic: "all" },
        { kind: "discovery", productId: "acme-docs" },
        { kind: "weekly-analyst" },
        { kind: "refresh" },
        { kind: "daily-note" },
      ]) {
        const response = await run(post("/api/agents/run", body));
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "token_missing" });
      }
      expect(listJobs(db())).toEqual([]);
      expect(auditEvents()).toEqual([]);
    });

    it("rejects an unknown topic", async () => {
      const response = await run(post("/api/agents/run", { kind: "research", topic: "nope" }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "unknown_topic" });
      expect(auditEvents()).toEqual([]);
    });

    it("rejects an unknown product", async () => {
      const response = await run(post("/api/agents/run", { kind: "discovery", productId: "x" }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "unknown_product" });
    });

    it("queues one research job per topic for 'all'", async () => {
      const response = await run(post("/api/agents/run", { kind: "research", topic: "all" }));
      expect(response.status).toBe(200);
      const { jobIds } = (await response.json()) as { jobIds: number[] };
      expect(jobIds).toHaveLength(10);
      expect(new Set(jobIds).size).toBe(10);
      expect(getJob(db(), jobIds[0] ?? 0)?.params).toEqual({ topic: "seo-fundamentals" });
    });

    it("queues discovery once and dedupes an identical request", async () => {
      const body = { kind: "discovery", productId: "acme-docs" };
      const first = (await (await run(post("/api/agents/run", body))).json()) as {
        jobIds: number[];
      };
      const second = (await (await run(post("/api/agents/run", body))).json()) as {
        jobIds: number[];
      };
      expect(first.jobIds).toHaveLength(1);
      expect(second.jobIds).toEqual(first.jobIds);
      const job = getJob(db(), first.jobIds[0] ?? 0);
      expect(job?.kind).toBe("discovery");
      expect(job?.requestedBy).toBe("owner@example.com");
      expect(auditEvents()[0]).toMatchObject({
        login: "owner@example.com",
        event: "agent_run_requested",
        detail: { kind: "discovery", productId: "acme-docs", jobIds: first.jobIds },
      });
    });

    describe("weekly analyst", () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        // Monday 5 October 2026, 00:30 in Brisbane: already ISO week 41 there (W40 in UTC).
        vi.setSystemTime(new Date("2026-10-04T14:30:00Z"));
      });
      afterEach(() => vi.useRealTimers());

      it("queues the current local week's report, once, and audits it", async () => {
        const body = { kind: "weekly-analyst" };
        const first = (await (await run(post("/api/agents/run", body))).json()) as {
          jobIds: number[];
        };
        const second = (await (await run(post("/api/agents/run", body))).json()) as {
          jobIds: number[];
        };
        expect(first.jobIds).toHaveLength(1);
        expect(second.jobIds).toEqual(first.jobIds);
        expect(getJob(db(), first.jobIds[0] ?? 0)).toMatchObject({
          kind: "weekly-analyst",
          params: { week: "2026-W41" },
          requestedBy: "owner@example.com",
        });
        expect(auditEvents()[0]).toMatchObject({
          login: "owner@example.com",
          event: "agent_run_requested",
          detail: { kind: "weekly-analyst", week: "2026-W41", jobIds: first.jobIds },
        });
      });

      it("never takes the week from the request", async () => {
        const response = await run(
          post("/api/agents/run", { kind: "weekly-analyst", week: "2020-W01" }),
        );
        expect(response.status).toBe(400);
        expect(listJobs(db())).toEqual([]);
      });
    });
  });

  describe("POST /api/agents/run: research refresh", () => {
    const doc = (researched: string) => `---\nresearched: ${researched}\n---\n# Doc\n`;
    let brain: ReturnType<typeof makeBrain>;
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
      brain = makeBrain({
        "research/glossary.md": doc("2026-01-10"),
        "research/seo/local-seo.md": "# No date\n",
        "research/seo/seo-fundamentals.md": doc("2026-03-01"),
        "research/scoring-rationale.md": doc("2026-05-01"),
        "00-start-here.md": doc("2026-09-30"),
      });
      mocks.brainDir = brain.root;
    });
    afterEach(() => {
      vi.useRealTimers();
      brain.cleanup();
    });

    it("queues the three oldest stale documents and audits them", async () => {
      const response = await run(post("/api/agents/run", { kind: "refresh" }));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { jobIds: number[]; stale: number };
      expect(body.stale).toBe(4);
      expect(body.jobIds).toHaveLength(3);
      expect(body.jobIds.map((id) => getJob(db(), id)?.params)).toEqual([
        { topic: "local-seo", mode: "refresh" },
        { topic: "glossary", mode: "refresh" },
        { topic: "seo-fundamentals", mode: "refresh" },
      ]);
      expect(getJob(db(), body.jobIds[0] ?? 0)?.requestedBy).toBe("owner@example.com");
      expect(auditEvents()).toMatchObject([
        {
          login: "owner@example.com",
          event: "agent_run_requested",
          detail: {
            kind: "refresh",
            topics: ["local-seo", "glossary", "seo-fundamentals"],
            jobIds: body.jobIds,
          },
        },
      ]);
    });

    it("queues nothing when nothing is stale, and still audits the click", async () => {
      mocks.brainDir = "/nonexistent/harbour-example-brain";
      const response = await run(post("/api/agents/run", { kind: "refresh" }));
      expect(await response.json()).toEqual({ jobIds: [], stale: 0 });
      expect(listJobs(db())).toEqual([]);
      expect(auditEvents()).toMatchObject([
        { event: "agent_run_requested", detail: { kind: "refresh", topics: [], jobIds: [] } },
      ]);
    });

    it("never queues a sprint run for a topic that is being refreshed", async () => {
      const refresh = (await (await run(post("/api/agents/run", { kind: "refresh" }))).json()) as {
        jobIds: number[];
      };
      const sprint = (await (
        await run(post("/api/agents/run", { kind: "research", topic: "glossary" }))
      ).json()) as { jobIds: number[] };
      expect(sprint.jobIds).toEqual([refresh.jobIds[1]]);
      expect(listJobs(db())).toHaveLength(3);
    });

    it("refuses extra keys", async () => {
      for (const body of [
        { kind: "refresh", topic: "glossary" },
        { kind: "refresh", month: "2026-10" },
      ]) {
        expect((await run(post("/api/agents/run", body))).status).toBe(400);
      }
      expect(listJobs(db())).toEqual([]);
      expect(auditEvents()).toEqual([]);
    });
  });

  describe("GET /api/agents/[id]", () => {
    const get = (id: number | string, after?: number) =>
      getRun(
        new Request(`${ORIGIN}/api/agents/${id}${after === undefined ? "" : `?after=${after}`}`),
        idParams(id),
      );

    it("requires a session", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await get(1)).status).toBe(401);
    });

    it("returns 404 for an unknown id", async () => {
      expect((await get(999)).status).toBe(404);
      expect((await get("abc")).status).toBe(404);
    });

    it("returns the job and events after the given id", async () => {
      const { id } = enqueueJob(db(), "research", { topic: "glossary" }, "owner@example.com");
      addEvent(db(), id, "status", "Started");
      addEvent(db(), id, "tool", "WebSearch");
      const all = (await (await get(id)).json()) as {
        job: { id: number; label: string; status: string };
        events: { id: number; text: string }[];
      };
      expect(all.job).toMatchObject({ id, label: "Research: Glossary", status: "queued" });
      expect(all.events.map((e) => e.text)).toEqual(["Started", "WebSearch"]);
      const firstId = all.events[0]?.id ?? 0;
      const later = (await (await get(id, firstId)).json()) as { events: { text: string }[] };
      expect(later.events.map((e) => e.text)).toEqual(["WebSearch"]);
    });
  });

  describe("POST /api/agents/[id]/cancel", () => {
    it("rejects cross-site requests", async () => {
      const { id } = enqueueJob(db(), "research", { topic: "glossary" }, null);
      const response = await cancel(
        post(`/api/agents/${id}/cancel`, {}, "https://elsewhere.example"),
        idParams(id),
      );
      expect(response.status).toBe(403);
      expect(getJob(db(), id)?.status).toBe("queued");
    });

    it("requires a session", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await cancel(post("/api/agents/1/cancel"), idParams(1))).status).toBe(401);
    });

    it("cancels a queued job", async () => {
      const { id } = enqueueJob(db(), "research", { topic: "glossary" }, null);
      const response = await cancel(post(`/api/agents/${id}/cancel`), idParams(id));
      expect(await response.json()).toEqual({ result: "cancelled" });
      expect(getJob(db(), id)?.status).toBe("cancelled");
      expect(auditEvents()).toMatchObject([
        { event: "agent_run_cancelled", detail: { jobId: id } },
      ]);
    });

    it("flags a running job for the worker and audits it", async () => {
      const { id } = enqueueJob(db(), "research", { topic: "glossary" }, null);
      claimNextJob(db());
      const response = await cancel(post(`/api/agents/${id}/cancel`), idParams(id));
      expect(await response.json()).toEqual({ result: "requested" });
      expect(getJob(db(), id)?.cancelRequested).toBe(true);
      expect(auditEvents()).toMatchObject([
        { event: "agent_run_cancelled", detail: { jobId: id } },
      ]);
    });

    it("returns 404 for a non-integer id", async () => {
      expect((await cancel(post("/api/agents/1.5/cancel"), idParams("1.5"))).status).toBe(404);
      expect((await cancel(post("/api/agents/abc/cancel"), idParams("abc"))).status).toBe(404);
    });

    it("reports an unknown job as not active", async () => {
      const response = await cancel(post("/api/agents/42/cancel"), idParams(42));
      expect(await response.json()).toEqual({ result: "not-active" });
      expect(auditEvents()).toEqual([]);
    });
  });

  describe("POST /api/agents/brain-push", () => {
    it("requires a session", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await brainPush(post("/api/agents/brain-push"))).status).toBe(401);
    });

    it("queues a brain-push job", async () => {
      const response = await brainPush(post("/api/agents/brain-push"));
      const { jobId } = (await response.json()) as { jobId: number };
      expect(getJob(db(), jobId)?.kind).toBe("brain-push");
    });
  });

  describe("POST /api/agents/notes-sync", () => {
    it("requires a session", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await notesSync(post("/api/agents/notes-sync"))).status).toBe(401);
    });

    it("rejects cross-site requests", async () => {
      const response = await notesSync(
        post("/api/agents/notes-sync", {}, "https://elsewhere.example"),
      );
      expect(response.status).toBe(403);
    });

    it("queues one notes-sync job and dedupes a repeat", async () => {
      const first = (await (await notesSync(post("/api/agents/notes-sync"))).json()) as {
        jobId: number;
      };
      const second = (await (await notesSync(post("/api/agents/notes-sync"))).json()) as {
        jobId: number;
      };
      expect(getJob(db(), first.jobId)?.kind).toBe("notes-sync");
      expect(second.jobId).toBe(first.jobId);
    });
  });
});
