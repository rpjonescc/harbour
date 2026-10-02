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

  it("returns the queued job for a double click at the daily cap and at the rate limit", () => {
    const db = openTestDb();
    const draft = (n: number) => ({
      ...base,
      dailyRuns: 3,
      kind: "content-draft" as const,
      params: { ideaId: `i${n}` },
      requestedBy: "me",
    });
    enqueueContent(db, draft(1));
    enqueueContent(db, draft(2));
    const third = enqueueContent(db, draft(3)); // the last run the cap allows
    const again = enqueueContent(db, draft(3)); // a double click: count is now at the cap
    expect(third).toMatchObject({ ok: true, created: true });
    expect(again).toEqual({ ok: true, id: third.ok ? third.id : -1, created: false });

    const db2 = openTestDb();
    const ask = (n: string) =>
      enqueueContent(db2, {
        ...base,
        dailyRuns: 100,
        kind: "content-digest",
        params: { day: n },
        requestedBy: "me",
      });
    ask("2026-10-01");
    const second = ask("2026-10-02"); // the 2nd digest: at the limit now
    expect(ask("2026-10-02")).toEqual({ ok: true, id: second.ok ? second.id : -1, created: false });
    expect(ask("2026-10-03")).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("finds the local day boundary across a daylight-saving change", () => {
    // Sydney moves from UTC+10 to UTC+11 on 2026-10-04 at 02:00 local, so 4 October starts at
    // 14:00 UTC on the 3rd and 5 October at 13:00 UTC on the 4th.
    const db = openTestDb();
    const zone = "Australia/Sydney";
    const add = (iso: string, day: string) =>
      enqueueContent(db, {
        ...base,
        timeZone: zone,
        now: new Date(iso),
        dailyRuns: 100,
        kind: "content-digest",
        params: { day },
        requestedBy: null,
      });
    add("2026-10-03T13:59:00Z", "a"); // 3 Oct 23:59 local: not 4 October's
    add("2026-10-03T14:00:00Z", "b"); // 4 Oct 00:00 local
    add("2026-10-04T12:59:00Z", "c"); // 4 Oct 23:59 local (UTC+11)
    expect(contentRunsToday(db, zone, new Date("2026-10-04T05:00:00Z"))).toBe(2);
    add("2026-10-04T13:00:00Z", "d"); // 5 Oct 00:00 local
    expect(contentRunsToday(db, zone, new Date("2026-10-04T05:00:00Z"))).toBe(3);
    expect(contentRunsToday(db, zone, new Date("2026-10-04T13:30:00Z"))).toBe(1);
  });
});
