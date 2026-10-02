import { listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { contentRunsToday, enqueueContent } from "./limits";

// Brisbane is UTC+10: 2026-10-02 10:00 local is 00:00 UTC.
const ZONE = "Australia/Brisbane";
const NOW = new Date("2026-10-02T02:00:00Z");
const base = { timeZone: ZONE, now: NOW, dailyRuns: 3 };

describe("enqueueContent", () => {
  it("queues a job, and a double click returns the same one", () => {
    const db = openTestDb();
    const a = enqueueContent(db, {
      ...base,
      kind: "content-draft",
      params: { ideaId: "x" },
      requestedBy: "me",
    });
    const b = enqueueContent(db, {
      ...base,
      kind: "content-draft",
      params: { ideaId: "x" },
      requestedBy: "me",
    });
    expect(a).toMatchObject({ ok: true, created: true });
    expect(b).toMatchObject({ ok: true, created: false });
    expect(listJobs(db)).toHaveLength(1);
  });

  it("refuses new work past the daily cap, but lets a chain in progress finish", () => {
    const db = openTestDb();
    for (const n of [1, 2, 3]) {
      enqueueContent(db, {
        ...base,
        kind: "content-draft",
        params: { ideaId: `i${n}` },
        requestedBy: null,
      });
    }
    expect(contentRunsToday(db, ZONE, NOW)).toBe(3);
    expect(
      enqueueContent(db, {
        ...base,
        kind: "content-draft",
        params: { ideaId: "i4" },
        requestedBy: "me",
      }),
    ).toEqual({ ok: false, reason: "daily_cap" });
    expect(
      enqueueContent(db, {
        ...base,
        kind: "content-atomise",
        params: { ideaId: "i1" },
        requestedBy: null,
        chained: true,
      }),
    ).toMatchObject({ ok: true, created: true });
  });

  it("counts only today's runs in the owner's time zone", () => {
    const db = openTestDb();
    enqueueContent(db, {
      ...base,
      now: new Date("2026-10-01T13:00:00Z"),
      kind: "content-digest",
      params: { day: "2026-09-30" },
      requestedBy: null,
    });
    expect(contentRunsToday(db, ZONE, NOW)).toBe(0); // 23:00 on 1 October, local
  });

  it("limits the owner's own requests: 2 digests a day, 3 idea runs per product, 4 requests per idea", () => {
    const db = openTestDb();
    const ask = (
      kind: "content-digest" | "content-ideas" | "content-draft",
      params: Record<string, string>,
    ) => enqueueContent(db, { ...base, dailyRuns: 100, kind, params, requestedBy: "me" });
    expect(ask("content-digest", { day: "2026-10-01" }).ok).toBe(true);
    expect(ask("content-digest", { day: "2026-10-02" }).ok).toBe(true);
    expect(ask("content-digest", { day: "2026-10-03" })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    for (const n of [1, 2, 3])
      expect(ask("content-ideas", { productId: "acme-docs", n: `${n}` }).ok).toBe(true);
    expect(ask("content-ideas", { productId: "acme-docs", n: "4" })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(ask("content-ideas", { productId: "other", n: "1" }).ok).toBe(true);
  });

  it("limits requests per idea to four a day", () => {
    const db = openTestDb();
    for (const n of [1, 2, 3, 4]) {
      const r = enqueueContent(db, {
        ...base,
        dailyRuns: 100,
        kind: "content-draft",
        params: { ideaId: "x", n: `${n}` },
        requestedBy: "me",
      });
      expect(r.ok).toBe(true);
    }
    expect(
      enqueueContent(db, {
        ...base,
        dailyRuns: 100,
        kind: "content-draft",
        params: { ideaId: "x", n: "5" },
        requestedBy: "me",
      }),
    ).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("never rate-limits the schedule, only the daily cap", () => {
    const db = openTestDb();
    for (const n of [1, 2, 3]) {
      expect(
        enqueueContent(db, {
          ...base,
          dailyRuns: 100,
          kind: "content-ideas",
          params: { productId: "acme-docs", n: `${n}` },
          requestedBy: null,
        }).ok,
      ).toBe(true);
    }
  });

  it("refuses a kind that is not a content agent kind, even when the type is erased", () => {
    const db = openTestDb();
    expect(() =>
      enqueueContent(db, { ...base, kind: "backup" as never, params: {}, requestedBy: "me" }),
    ).toThrow(/not a content/i);
    expect(listJobs(db)).toHaveLength(0);
  });
});
