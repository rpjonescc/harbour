import { brainDocs } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { weeklyPanelView } from "./panel-view";

const NOW = new Date("2026-10-02T09:00:00Z"); // Friday
const settings = { timeZone: "Australia/Sydney", locale: "en-GB", enabled: true, tokenSet: true };

function indexDocs(paths: string[]) {
  const db = openTestDb();
  for (const path of paths) {
    db.insert(brainDocs).values({ path, title: path, mtime: NOW, contentHash: "h" }).run();
  }
  return db;
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
    expect(weeklyPanelView(db, settings, NOW)).toEqual({
      nextRun: "Sunday 4 Oct, 20:00",
      latestReport: { week: "2026-W40", href: "/brain/reports/weekly/2026-W40.md" },
      tokenSet: true,
    });
  });

  it("has no next run when scheduled runs are off, and no report before the first", () => {
    const view = weeklyPanelView(
      indexDocs([]),
      { ...settings, enabled: false, tokenSet: false },
      NOW,
    );
    expect(view).toEqual({ nextRun: null, latestReport: null, tokenSet: false });
  });
});
