import { listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { queueBackupNow } from "./backup-now";

// 2 October 2026, 00:30 in Brisbane: still 1 October in UTC.
const NOW = new Date("2026-10-01T14:30:00Z");

describe("queueBackupNow", () => {
  it("queues a backup of the current local day", () => {
    const db = openTestDb();
    expect(queueBackupNow(db, "Australia/Brisbane", NOW)).toEqual({
      id: expect.any(Number),
      created: true,
      day: "2026-10-02",
    });
    expect(listJobs(db).map((j) => [j.kind, j.params, j.requestedBy])).toEqual([
      ["backup", { day: "2026-10-02" }, null],
    ]);
  });

  it("does not queue a second backup while one is queued", () => {
    const db = openTestDb();
    const first = queueBackupNow(db, "Australia/Brisbane", NOW);
    expect(queueBackupNow(db, "Australia/Brisbane", NOW)).toEqual({ ...first, created: false });
    expect(listJobs(db)).toHaveLength(1);
  });
});
