import { ago, HOUR, job, LONDON, MIN, PRODUCTS, t0 } from "@/tests/helpers/tower";
import { activityFeed } from "./activity";
import type { ActivityFacts, CardMove } from "./activity-data";

const quiet: ActivityFacts = {
  running: [],
  queued: [],
  finished: [],
  moves: [],
  scoreRises: [],
  nextRun: null,
};
const feed = (over: Partial<ActivityFacts>) =>
  activityFeed({ ...quiet, ...over }, PRODUCTS, t0, LONDON, "en-GB");

const move = (over: Partial<CardMove> = {}): CardMove => ({
  actionId: 4,
  title: "Add a sitemap",
  productId: "acme-docs",
  actor: "claude",
  toStatus: "done",
  toStage: null,
  at: ago(2 * HOUR),
  ...over,
});

describe("activityFeed", () => {
  it("says nothing ran, and when the next run is, when the day was quiet", () => {
    expect(feed({})).toEqual({
      running: [],
      finished: [],
      more: 0,
      empty: "Nothing ran in the last day.",
    });
    // 05:00 UTC tomorrow is 06:00 in London.
    expect(feed({ nextRun: new Date("2026-10-03T05:00:00Z") }).empty).toBe(
      "Nothing ran in the last day. The next run is at 06:00.",
    );
    expect(feed({ nextRun: new Date("2026-10-05T05:00:00Z") }).empty).toBe(
      "Nothing ran in the last day. The next run is at 5 Oct, 06:00.",
    );
  });

  it("lists what is running and waiting, with when it started and a link", () => {
    const running = job({
      id: 9,
      kind: "scan",
      params: { productId: "acme-docs" },
      status: "running",
      startedAt: ago(4 * MIN),
    });
    const queued = job({ id: 10, kind: "daily-note", status: "queued", createdAt: ago(MIN) });
    const { running: items, empty } = feed({ running: [running], queued: [queued] });
    expect(empty).toBeNull();
    expect(items[0]).toEqual({
      id: "job-9",
      kind: "running",
      sentence: "Checking Acme Docs.",
      at: ago(4 * MIN),
      ago: "4 min ago",
      href: "/agents/9",
      isNew: true,
      technical: "Check: Acme Docs (scan)",
    });
    expect(items[1]?.sentence).toBe("Waiting to start writing the daily note.");
  });

  it("puts wins first and failures last, newest first within each", () => {
    const { finished } = feed({
      finished: [
        job({ id: 1, kind: "backup", params: { day: "2026-10-02" }, finishedAt: ago(MIN) }),
        job({
          id: 2,
          kind: "discovery",
          params: { productId: "acme-blog" },
          status: "failed",
          finishedAt: ago(30 * MIN),
        }),
        job({
          id: 3,
          kind: "weekly-analyst",
          params: { week: "2026-W40" },
          finishedAt: ago(3 * HOUR),
        }),
      ],
      moves: [
        move(),
        move({
          actionId: 5,
          title: "Fix the title",
          toStatus: "open",
          toStage: "started",
          at: ago(10 * MIN),
        }),
      ],
      scoreRises: [{ productId: "acme-docs", area: "seo", from: 52, to: 58, at: ago(5 * HOUR) }],
    });
    expect(finished.map((i) => [i.kind, i.sentence])).toEqual([
      ["win", "Claude moved “Add a sitemap” to Done."],
      ["win", "Wrote the weekly report."],
      ["win", "Acme Docs: Found on Google up 6."],
      ["finished", "Backed up Harbour."],
      ["finished", "Claude moved “Fix the title” to Started."],
    ]);
    expect(feed({ finished: [job({ id: 2, status: "failed" })] }).finished[0]).toMatchObject({
      kind: "failed",
      sentence: "Didn't finish writing the daily note.",
      technical: "Daily note: 2026-10-02 (daily-note)",
    });
  });

  it("links each item to its run, card or product", () => {
    const { finished } = feed({
      finished: [job({ id: 3 })],
      moves: [move()],
      scoreRises: [{ productId: "acme-blog", area: "aeo", from: 40, to: 41, at: ago(HOUR) }],
    });
    expect(finished.map((i) => i.href).sort()).toEqual([
      "/actions#action-4",
      "/agents/3",
      "/products/acme-blog",
    ]);
  });

  it("shows at most five and counts the rest", () => {
    const finished = Array.from({ length: 8 }, (_, i) =>
      job({ id: i + 1, finishedAt: ago((i + 1) * MIN) }),
    );
    const result = feed({ finished });
    expect(result.finished).toHaveLength(5);
    expect(result.more).toBe(3);
    expect(result.finished.map((i) => i.id)).toEqual(["job-1", "job-2", "job-3", "job-4", "job-5"]);
  });

  it("marks an item new under 5 minutes and not at 5 minutes", () => {
    const at = (ms: number) => feed({ moves: [move({ at: ago(ms) })] }).finished[0]?.isNew;
    expect(at(4 * MIN + 59_000)).toBe(true);
    expect(at(5 * MIN)).toBe(false);
  });
});
