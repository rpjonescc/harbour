import { listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { queueWeeklyAnalyst } from "./analyst-now";

// Monday 5 October 2026, 00:30 in Brisbane: ISO week 41 there, still week 40 in UTC.
const NOW = new Date("2026-10-04T14:30:00Z");
const settings = { timeZone: "Australia/Brisbane", tokenSet: true };

describe("queueWeeklyAnalyst", () => {
  it("queues the report for the current local week", () => {
    const db = openTestDb();
    expect(queueWeeklyAnalyst(db, settings, NOW)).toEqual({
      id: expect.any(Number),
      created: true,
      week: "2026-W41",
    });
    expect(listJobs(db).map((j) => [j.kind, j.params, j.requestedBy])).toEqual([
      ["weekly-analyst", { week: "2026-W41" }, null],
    ]);
  });

  it("does not queue a second run while one for the week is queued", () => {
    const db = openTestDb();
    const first = queueWeeklyAnalyst(db, settings, NOW);
    expect(queueWeeklyAnalyst(db, settings, NOW)).toEqual({ ...first, created: false });
    expect(listJobs(db)).toHaveLength(1);
  });

  it("refuses without a Claude token, queueing nothing", () => {
    const db = openTestDb();
    expect(() => queueWeeklyAnalyst(db, { ...settings, tokenSet: false }, NOW)).toThrow(
      "HARBOUR_CLAUDE_OAUTH_TOKEN is not set: the weekly analyst needs it",
    );
    expect(listJobs(db)).toEqual([]);
  });
});
