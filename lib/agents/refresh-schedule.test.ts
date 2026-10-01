import type { Db } from "@/lib/db/client";
import { claimNextJob, enqueueJob, finishJob, listJobs } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import {
  enqueueResearch,
  makeRefreshSchedule,
  nextMonthlyRefresh,
  queueRefreshes,
} from "./refresh-schedule";

// Brisbane is UTC+10 all year: the first-Sunday 21:00 slots are 11:00 UTC on 6 Sep, 4 Oct and
// 1 Nov 2026.
const BRISBANE = "Australia/Brisbane";
const SEPT_SLOT = new Date("2026-09-06T11:00:00Z");
const doc = (researched: string) => `---\ntitle: Example\nresearched: ${researched}\n---\n# Body\n`;
const STALE_BRAIN = {
  "research/glossary.md": doc("2026-01-10"),
  "research/seo/local-seo.md": "# No frontmatter: date unknown\n",
  "research/seo/seo-fundamentals.md": doc("2026-03-01"),
  "research/scoring-rationale.md": doc("2026-05-01"),
  "00-start-here.md": doc("2026-09-30"),
};
const FRESH_BRAIN = { "research/glossary.md": doc("2026-09-30") };

type Options = { db?: Db; root?: string; enabled?: boolean; tokenSet?: boolean };

function harness(root: string, options: Options = {}) {
  const db = options.db ?? openTestDb();
  let now = 0;
  const schedule = makeRefreshSchedule({
    db,
    root: options.root ?? root,
    timeZone: BRISBANE,
    enabled: options.enabled ?? true,
    tokenSet: options.tokenSet ?? true,
    clock: () => now,
  });
  return {
    db,
    at: (iso: string) => {
      now = Date.parse(iso);
      return schedule.tick();
    },
    jobs: () =>
      listJobs(db, 100)
        .filter((j) => j.kind === "research")
        .map((j) => j.params)
        .reverse(),
    settleAll: (status: "ok" | "failed" = "ok") => {
      for (let job = claimNextJob(db); job; job = claimNextJob(db)) {
        finishJob(db, job.id, status, status === "ok" ? null : "Agent failed");
      }
    },
  };
}

/** September's round, already run, so only October's is due. */
function septemberRan(db: Db) {
  enqueueJob(
    db,
    "research",
    { topic: "glossary", mode: "refresh", month: "2026-09" },
    null,
    SEPT_SLOT,
  );
  for (let job = claimNextJob(db); job; job = claimNextJob(db)) finishJob(db, job.id, "ok", null);
}

const OCTOBER = (topic: string) => ({ topic, mode: "refresh", month: "2026-10" });

describe("monthly research refresh schedule", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let brain: ReturnType<typeof makeBrain>;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    brain = makeBrain(STALE_BRAIN);
  });
  afterEach(() => {
    log.mockRestore();
    brain.cleanup();
  });

  it("queues the three oldest stale documents at the first Sunday's 21:00, once", () => {
    const h = harness(brain.root);
    septemberRan(h.db);
    expect(h.at("2026-10-04T10:59:00Z")).toEqual([]); // 20:59
    const queued = h.at("2026-10-04T11:00:00Z");
    expect(queued.map((q) => q.topicId)).toEqual(["local-seo", "glossary", "seo-fundamentals"]);
    expect(h.jobs().slice(1)).toEqual([
      OCTOBER("local-seo"),
      OCTOBER("glossary"),
      OCTOBER("seo-fundamentals"),
    ]);
    expect(h.at("2026-10-04T11:01:00Z")).toEqual([]); // second tick, jobs still queued
    h.settleAll();
    expect(h.at("2026-10-04T11:02:00Z")).toEqual([]); // done: the month's round has run
    expect(h.jobs()).toHaveLength(4);
  });

  it("does not queue again after a restart", () => {
    const db = openTestDb();
    septemberRan(db);
    expect(harness(brain.root, { db }).at("2026-10-04T11:00:00Z")).toHaveLength(3);
    const restarted = harness(brain.root, { db });
    expect(restarted.at("2026-10-04T12:00:00Z")).toEqual([]);
    restarted.settleAll();
    expect(harness(brain.root, { db }).at("2026-10-05T12:00:00Z")).toEqual([]);
  });

  it("never retries a failed round in the same month", () => {
    const h = harness(brain.root);
    septemberRan(h.db);
    expect(h.at("2026-10-04T11:00:00Z")).toHaveLength(3);
    h.settleAll("failed");
    expect(h.at("2026-10-04T11:01:00Z")).toEqual([]);
    expect(harness(brain.root, { db: h.db }).at("2026-10-20T00:00:00Z")).toEqual([]);
    expect(h.jobs()).toHaveLength(4);
  });

  it("queues the next month's round at its slot", () => {
    const h = harness(brain.root);
    septemberRan(h.db);
    h.at("2026-10-04T11:00:00Z");
    h.settleAll();
    expect(h.at("2026-11-01T10:59:00Z")).toEqual([]);
    expect(h.at("2026-11-01T11:00:00Z").map((q) => q.topicId)).toEqual([
      "local-seo",
      "glossary",
      "seo-fundamentals",
    ]);
  });

  it("skips a topic that already has a research job queued or running", () => {
    const h = harness(brain.root);
    septemberRan(h.db);
    enqueueJob(h.db, "research", { topic: "local-seo" }, "owner");
    claimNextJob(h.db); // running
    enqueueJob(h.db, "research", { topic: "glossary" }, "owner"); // queued
    expect(h.at("2026-10-04T11:00:00Z").map((q) => q.topicId)).toEqual([
      "seo-fundamentals",
      "scoring-rationale",
    ]);
  });

  it("catches up once at start, for the latest slot's month only", () => {
    const h = harness(brain.root);
    // Down since before September's slot: one round, for October.
    expect(h.at("2026-10-20T00:00:00Z")).toHaveLength(3);
    expect(h.jobs().every((p) => p.month === "2026-10")).toBe(true);
    expect(harness(brain.root, { db: h.db }).at("2026-10-21T00:00:00Z")).toEqual([]);
  });

  it("logs once when nothing is stale and queues nothing", () => {
    const fresh = makeBrain(FRESH_BRAIN);
    try {
      const h = harness(fresh.root);
      septemberRan(h.db);
      expect(h.at("2026-10-04T11:00:00Z")).toEqual([]);
      expect(h.at("2026-10-04T11:01:00Z")).toEqual([]);
      expect(h.at("2026-10-05T11:00:00Z")).toEqual([]);
      expect(h.jobs()).toHaveLength(1);
      expect(log.mock.calls).toEqual([["research refresh: nothing stale for 2026-10"]]);
    } finally {
      fresh.cleanup();
    }
  });

  it("queues nothing when the schedule is off", () => {
    const h = harness(brain.root, { enabled: false });
    expect(h.at("2026-10-04T11:00:00Z")).toEqual([]);
    expect(h.jobs()).toEqual([]);
  });

  it("queues nothing without a Claude token, saying so once", () => {
    const h = harness(brain.root, { tokenSet: false });
    expect(h.at("2026-10-04T11:00:00Z")).toEqual([]);
    expect(h.at("2026-10-04T11:01:00Z")).toEqual([]);
    expect(h.jobs()).toEqual([]);
    expect(log.mock.calls).toEqual([["research refresh skipped: no Claude token"]]);
  });

  it("queues nothing when the brain folder is unusable, saying so once", () => {
    const h = harness(brain.root, { root: "/nonexistent/harbour-example-brain" });
    expect(h.at("2026-10-04T11:00:00Z")).toEqual([]);
    expect(h.at("2026-10-04T11:01:00Z")).toEqual([]);
    expect(h.jobs()).toEqual([]);
    expect(log.mock.calls).toEqual([["research refresh skipped: the brain folder is missing"]]);
  });

  it("checks at most every 30 seconds", () => {
    const h = harness(brain.root);
    septemberRan(h.db);
    expect(h.at("2026-10-04T10:59:50Z")).toEqual([]);
    expect(h.at("2026-10-04T11:00:10Z")).toEqual([]); // 20 s later: not checked
    expect(h.at("2026-10-04T11:00:20Z")).toHaveLength(3);
  });
});

describe("queueRefreshes", () => {
  it("queues up to three refreshes by hand, without a month, and counts every stale one", () => {
    const brain = makeBrain(STALE_BRAIN);
    try {
      const db = openTestDb();
      const now = new Date("2026-10-02T00:00:00Z");
      const input = {
        root: brain.root,
        today: "2026-10-02",
        requestedBy: "owner",
        month: null,
        now,
      };
      const first = queueRefreshes(db, input);
      expect(first.stale).toBe(4);
      expect(first.queued.map((q) => q.topicId)).toEqual([
        "local-seo",
        "glossary",
        "seo-fundamentals",
      ]);
      expect(listJobs(db).map((j) => [j.params, j.requestedBy])).toEqual([
        [{ topic: "seo-fundamentals", mode: "refresh" }, "owner"],
        [{ topic: "glossary", mode: "refresh" }, "owner"],
        [{ topic: "local-seo", mode: "refresh" }, "owner"],
      ]);
      // A second click while those are queued takes the next stale one only.
      expect(queueRefreshes(db, input).queued.map((q) => q.topicId)).toEqual(["scoring-rationale"]);
      expect(queueRefreshes(db, input)).toEqual({ queued: [], stale: 4 });
    } finally {
      brain.cleanup();
    }
  });
});

describe("queueRefreshes and the web", () => {
  it("reads the active topics and queues in one immediate transaction", () => {
    const brain = makeBrain(STALE_BRAIN);
    try {
      const db = openTestDb();
      for (const topic of ["local-seo", "glossary", "seo-fundamentals", "scoring-rationale"]) {
        enqueueJob(db, "research", { topic }, "owner");
      }
      const spy = vi.spyOn(db, "transaction"); // nothing left to enqueue: only the read's own

      const now = new Date("2026-10-02T00:00:00Z");
      queueRefreshes(db, {
        root: brain.root,
        today: "2026-10-02",
        requestedBy: null,
        month: null,
        now,
      });
      expect(spy.mock.calls.map((call) => call[1])).toEqual([{ behavior: "immediate" }]);
    } finally {
      brain.cleanup();
    }
  });
});

describe("enqueueResearch", () => {
  it("returns a topic's active research job instead of queueing a second one", () => {
    const db = openTestDb();
    const refresh = enqueueJob(db, "research", { topic: "glossary", mode: "refresh" }, null);
    const ids = enqueueResearch(db, ["glossary", "local-seo"], "owner");
    expect(ids[0]).toBe(refresh.id);
    expect(listJobs(db).map((j) => j.params)).toEqual([
      { topic: "local-seo" },
      { topic: "glossary", mode: "refresh" },
    ]);
  });
});

describe("nextMonthlyRefresh", () => {
  it("is the next first Sunday at 21:00, or null when off", () => {
    const now = new Date("2026-10-05T00:00:00Z");
    expect(nextMonthlyRefresh(now, BRISBANE, true)).toEqual(new Date("2026-11-01T11:00:00Z"));
    expect(nextMonthlyRefresh(now, BRISBANE, false)).toBeNull();
  });
});
