import { type Config, parseConfig } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { TREG_REASONS } from "@/lib/explain/treg";
import { saveExternalChecks } from "@/lib/external/store";
import { claimNextJob, enqueueJob, finishJob } from "@/lib/jobs/queue";
import type { ProductTracking } from "@/lib/products/config";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { type OutsideViewInput, outsideView } from "./outside-view";
import type { Observation } from "./types";

const DAY = 24 * 60 * 60_000;
const NOW = new Date("2026-10-11T06:00:00Z");
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);
const PRODUCT = { id: "acme-docs", url: "https://www.docs.example.com/" };
const TRACKING: ProductTracking = {
  queries: ["acme docs", "docs tools"],
  questions: ["Who is Acme?"],
  country: "AU",
  languageCode: "en",
};
const config = (env: Record<string, string> = {}): Config =>
  parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: "https://harbour.example.ts.net",
    HARBOUR_RP_ID: "harbour.example.ts.net",
    HARBOUR_TIMEZONE: "UTC",
    HARBOUR_TREG_API_KEY: "example-key",
    HARBOUR_MONTHLY_BUDGET_AUD: "10",
    ...env,
  });

const links = (daysAgo: number, n: number): Observation => ({
  kind: "backlinks",
  subject: "docs.example.com",
  value: {
    referringDomains: n,
    backlinks: 9,
    dofollow: 5,
    rank: null,
    provider: "serpstat",
    checkedAt: at(daysAgo).toISOString(),
  },
});
const rank = (query: string, position: number | null, daysAgo: number): Observation => ({
  kind: "serp_rank",
  subject: query,
  value: { query, position, url: null, topDomains: [], checkedAt: at(daysAgo).toISOString() },
});
const answer = (
  question: string,
  named: boolean,
  domains: string[],
  daysAgo: number,
): Observation => ({
  kind: "ai_answer",
  subject: question,
  value: {
    question,
    named,
    cited: domains.length > 0,
    citedDomains: domains,
    businessesNamed: null,
    checkedAt: at(daysAgo).toISOString(),
  },
});

function view(db: Db, over: Partial<OutsideViewInput> = {}) {
  return outsideView({
    db,
    config: config(),
    product: PRODUCT,
    tracking: TRACKING,
    now: NOW,
    ...over,
  });
}
const keep = (db: Db, observations: Observation[]) =>
  saveExternalChecks(db, { productId: "acme-docs", scanId: null, jobId: null, observations });

describe("outsideView: the reasons there is nothing", () => {
  it("says no searches are chosen, for no entry and for empty lists", () => {
    const db = openTestDb();
    expect(view(db, { tracking: null }).state).toBe("no_searches");
    expect(view(db, { tracking: { ...TRACKING, queries: [], questions: [] } }).state).toBe(
      "no_searches",
    );
  });

  it("says Treg isn't connected, after the searches", () => {
    const db = openTestDb();
    const bare = { ...config(), HARBOUR_TREG_API_KEY: undefined };
    expect(view(db, { config: bare }).state).toBe("not_connected");
    expect(view(db, { config: bare, tracking: null }).state).toBe("no_searches");
  });

  it("says not checked yet, with every number absent rather than zero", () => {
    const found = view(openTestDb());
    expect(found).toMatchObject({ state: "not_checked", links: null, ai: null, checkedAt: null });
    expect(found.searches.map((s) => [s.query, s.checked, s.position])).toEqual([
      ["acme docs", false, null],
      ["docs tools", false, null],
    ]);
  });
});

describe("outsideView: results", () => {
  it("reads the latest links count and the change since the check before", () => {
    const db = openTestDb();
    keep(db, [links(7, 3), links(0, 5)]);
    expect(view(db).links).toEqual({ count: 5, change: 2, checkedAt: NOW.toISOString() });
  });

  it("has no change for the first links check", () => {
    const db = openTestDb();
    keep(db, [links(0, 5)]);
    expect(view(db).links?.change).toBeNull();
  });

  it("gives each chosen search its latest position and how it moved", () => {
    const db = openTestDb();
    keep(db, [
      rank("acme docs", 9, 14),
      rank("acme docs", 5, 7),
      rank("acme docs", 3, 0),
      rank("docs tools", null, 7),
      rank("docs tools", null, 0),
    ]);
    const rows = view(db).searches;
    expect(rows[0]).toMatchObject({ position: 3, change: "up", before: { position: 5 } });
    expect(rows[1]).toMatchObject({ position: null, change: "same", before: { position: null } });
  });

  it.each([
    [5, 8, "up"],
    [8, 5, "down"],
    [7, null, "up"],
    [null, 7, "down"],
    [4, 4, "same"],
  ] as const)("a position of %s after %s is %s", (latest, before, change) => {
    const db = openTestDb();
    keep(db, [rank("acme docs", before, 7), rank("acme docs", latest, 0)]);
    expect(view(db).searches[0]?.change).toBe(change);
  });

  it("calls a search seen once the first check, and never carries one search's position to another", () => {
    const db = openTestDb();
    keep(db, [rank("acme docs", 6, 0), rank("not chosen", 1, 0)]);
    const [first, second] = view(db).searches;
    expect(first).toMatchObject({ checked: true, position: 6, change: "first", before: null });
    expect(second).toMatchObject({ checked: false, position: null, change: null });
  });

  it("tallies the latest AI check: answers, names, links and the most cited sites", () => {
    const db = openTestDb();
    keep(db, [
      answer("Who is Acme?", true, ["a.example.org", "b.example.org"], 0),
      answer("What is Acme?", false, ["a.example.org"], 0),
      answer("Old question?", true, ["old.example.org"], 7),
    ]);
    expect(view(db).ai).toEqual({
      asked: 2,
      named: 1,
      cited: 2,
      domains: ["a.example.org", "b.example.org"],
      checkedAt: NOW.toISOString(),
    });
  });

  it("is ready with one kind of result, and reports the newest check", () => {
    const db = openTestDb();
    keep(db, [links(3, 2), answer("Who is Acme?", false, [], 1)]);
    const found = view(db);
    expect(found.state).toBe("ready");
    expect(found.checkedAt).toBe(at(1).toISOString());
  });

  it("ignores another product's checks", () => {
    const db = openTestDb();
    saveExternalChecks(db, {
      productId: "other",
      scanId: null,
      jobId: null,
      observations: [links(0, 9)],
    });
    expect(view(db).state).toBe("not_checked");
  });
});

function scanWith(
  db: Db,
  daysAgo: number,
  status: "ok" | "failed" | "skipped" | "not_configured",
  error?: string,
) {
  seedScan(db, {
    productId: "acme-docs",
    at: at(daysAgo),
    runs: [{ collector: "treg", status, error }],
  });
}
function manualJob(
  db: Db,
  daysAgo: number,
  status: "ok" | "failed",
  error: string | null,
  result: string | null,
) {
  enqueueJob(db, "outside-check", { productId: "acme-docs" }, "owner@example.com", at(daysAgo));
  const job = claimNextJob(db, at(daysAgo));
  if (job) finishJob(db, job.id, status, error, at(daysAgo), result);
}

describe("outsideView: what the last attempt says", () => {
  it.each([
    [TREG_REASONS.key, "paused_key"],
    [TREG_REASONS.balance, "paused_balance"],
    [TREG_REASONS.paused, "paused"],
    ["None of the outside-view checks could be completed this time.", "failed"],
  ] as const)("a failed scheduled run %j is the notice %s", (error, notice) => {
    const db = openTestDb();
    keep(db, [links(10, 3)]);
    scanWith(db, 0, "failed", error);
    expect(view(db).notice).toBe(notice);
  });

  it("a budget skip is the budget notice, but a weekly or backoff skip says nothing", () => {
    const db = openTestDb();
    scanWith(db, 2, "skipped", "budget: A$10.00 monthly budget reached (A$10.00 spent)");
    expect(view(db).notice).toBe("budget");
    scanWith(db, 1, "skipped", "runs weekly; last ran 2026-10-05");
    scanWith(db, 0, "skipped", TREG_REASONS.backingOff);
    expect(view(db).notice).toBe("budget");
  });

  it("an ok run ends an earlier problem", () => {
    const db = openTestDb();
    scanWith(db, 3, "failed", TREG_REASONS.key);
    scanWith(db, 1, "ok");
    expect(view(db).notice).toBeNull();
  });

  it("takes whichever is newer, the scheduled run or a manual check", () => {
    const db = openTestDb();
    scanWith(db, 3, "failed", TREG_REASONS.key);
    manualJob(db, 1, "ok", null, "ok");
    expect(view(db).notice).toBeNull();
    manualJob(db, 0, "failed", TREG_REASONS.balance, null);
    expect(view(db).notice).toBe("paused_balance");
  });

  it("a manual check skipped for the budget is the budget notice", () => {
    const db = openTestDb();
    manualJob(db, 0, "ok", "budget: no monthly budget set (HARBOUR_MONTHLY_BUDGET_AUD)", "skipped");
    expect(view(db).notice).toBe("budget");
  });

  it("has no notice for a product never checked, or one not configured", () => {
    const db = openTestDb();
    expect(view(db).notice).toBeNull();
    scanWith(db, 0, "not_configured", TREG_REASONS.noSearches);
    expect(view(db).notice).toBeNull();
  });
});

describe("outsideView: the check button", () => {
  it("is active while a check is queued or running", () => {
    const db = openTestDb();
    enqueueJob(db, "outside-check", { productId: "acme-docs" }, null, at(0));
    expect(view(db).check.active).toBe("queued");
    claimNextJob(db, at(0));
    expect(view(db).check.active).toBe("running");
  });

  it("carries the reason a new check would be refused", () => {
    const db = openTestDb();
    expect(view(db).check.refusal).toBeNull();
    expect(view(db, { config: config({ HARBOUR_MONTHLY_BUDGET_AUD: "0" }) }).check.refusal).toBe(
      "budget_used_up",
    );
  });
});
