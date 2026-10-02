import { brainDocs } from "@/lib/db/schema";
import { claimNextJob, finishJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { weeklyPanelView } from "./panel-view";
import { enqueueWeeklyAnalyst } from "./schedule";

const NOW = new Date("2026-10-02T09:00:00Z"); // Friday 2 Oct in Sydney
const LAST_SLOT = new Date("2026-09-27T10:00:00Z"); // Sunday 27 Sep, 20:00 AEST
const settings = { timeZone: "Australia/Sydney", locale: "en-GB", enabled: true, tokenSet: true };

function indexDocs(paths: string[]) {
  const db = openTestDb();
  for (const path of paths) {
    db.insert(brainDocs).values({ path, title: path, mtime: NOW, contentHash: "h" }).run();
  }
  return db;
}

/** Last Sunday's scheduled run, finished. */
function lastWeekRan(db: ReturnType<typeof openTestDb>) {
  enqueueWeeklyAnalyst(db, "2026-W39", null, LAST_SLOT);
  const job = claimNextJob(db, LAST_SLOT);
  if (job) finishJob(db, job.id, "ok", null, LAST_SLOT);
}

describe("weeklyPanelView", () => {
  it("shows the next scheduled run and links the latest weekly report", () => {
    const db = indexDocs([
      "reports/weekly/2026-W39.md",
      "reports/weekly/2026-W40.md",
      "reports/weekly/2026-W41.proposals.json",
      "reports/weekly/zz-notes.md",
      "reports/2026-W42.md",
    ]);
    lastWeekRan(db);
    expect(weeklyPanelView(db, settings, NOW)).toEqual({
      schedule: "Next report: Sunday 4 Oct, 20:00",
      latestReport: { week: "2026-W40", href: "/brain/reports/weekly/2026-W40.md" },
      tokenSet: true,
    });
  });

  it("says when scheduled runs are off, and that there is no report before the first", () => {
    const view = weeklyPanelView(indexDocs([]), { ...settings, enabled: false }, NOW);
    expect(view).toEqual({
      schedule: "The weekly report only runs when you ask for it.",
      latestReport: null,
      tokenSet: true,
    });
  });

  it("says scheduled runs need a token when it is missing", () => {
    const view = weeklyPanelView(indexDocs([]), { ...settings, tokenSet: false }, NOW);
    expect(view).toMatchObject({
      schedule: "The weekly report is paused until Claude is connected.",
      tokenSet: false,
    });
  });

  it("says a catch-up is due when last Sunday's run was never queued", () => {
    expect(weeklyPanelView(indexDocs([]), settings, NOW).schedule).toBe(
      "Last week's report (2026-W39) is due. Harbour starts it shortly, if a site was checked in the last 7 days.",
    );
  });

  it("says a weekly report is queued or running", () => {
    const db = indexDocs([]);
    lastWeekRan(db);
    enqueueWeeklyAnalyst(db, "2026-W40", "owner", NOW);
    expect(weeklyPanelView(db, settings, NOW).schedule).toBe(
      "This week's report is waiting to start.",
    );
    claimNextJob(db, NOW);
    expect(weeklyPanelView(db, settings, NOW).schedule).toBe(
      "This week's report is being written now.",
    );
  });
});
