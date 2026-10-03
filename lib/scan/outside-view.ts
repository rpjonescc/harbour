// What the "How the web sees you" section shows. Web-safe: reads the history table and job state,
// never a collector or a secret's value.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { collectorRuns, jobs, scanRuns } from "@/lib/db/schema";
import type { OutsideRefusal } from "@/lib/explain/outside-check";
import { TREG_REASONS } from "@/lib/explain/treg";
import { readChecks, type StoredCheck } from "@/lib/external/store";
import { activeOutsideCheck, outsideCheckRefusal } from "@/lib/jobs/outside-check";
import type { ProductTracking } from "@/lib/products/config";
import { siteKey } from "./site";
import type { AiAnswer, Backlinks, SerpRank } from "./treg-shapes";

const READ_DAYS = 120;
const MAX_DOMAINS = 5;

export type RankChange = "up" | "down" | "same" | "first";
export type OutsideNotice = "paused" | "paused_key" | "paused_balance" | "budget" | "failed";

export type SearchRow = {
  query: string;
  /** False until the search has been checked: say so, never show a position. */
  checked: boolean;
  position: number | null;
  url: string | null;
  checkedAt: string | null;
  /** Against the check before; "first" when there is only one. */
  change: RankChange | null;
  /** The position before, when there was an earlier check (null: it was not in the top 30). */
  before: { position: number | null } | null;
};

export type OutsideView = {
  /** What to show: a reason there is nothing, or the data (with a notice if the last try failed). */
  state: "no_searches" | "not_connected" | "not_checked" | "ready";
  notice: OutsideNotice | null;
  /** The newest check of any kind (ISO), or null. */
  checkedAt: string | null;
  links: { count: number; change: number | null; checkedAt: string } | null;
  searches: SearchRow[];
  ai: {
    asked: number;
    named: number;
    cited: number;
    /** Sites the answers cited most, as plain text. */
    domains: string[];
    checkedAt: string;
  } | null;
  /** A check is queued or running, or why one can't be started now. */
  check: { active: "queued" | "running" | null; refusal: OutsideRefusal | null };
};

type Attempt = { status: "ok" | "failed" | "skipped"; error: string | null; at: number };

/** The scheduled run's skips that say nothing about how the last real attempt went. */
const isCadenceSkip = (error: string | null) =>
  error !== null && (error.startsWith("runs weekly") || error.startsWith("backing off"));

function scheduledAttempt(db: Db, productId: string): Attempt | null {
  const rows = db
    .select({
      status: collectorRuns.status,
      error: collectorRuns.error,
      at: collectorRuns.finishedAt,
    })
    .from(collectorRuns)
    .innerJoin(scanRuns, eq(collectorRuns.scanId, scanRuns.id))
    .where(and(eq(scanRuns.productId, productId), eq(collectorRuns.collector, "treg")))
    .orderBy(desc(collectorRuns.id))
    .limit(20)
    .all();
  const row = rows.find((r) => r.status !== "not_configured" && !isCadenceSkip(r.error));
  return row
    ? { status: row.status as Attempt["status"], error: row.error, at: row.at.getTime() }
    : null;
}

function manualAttempt(db: Db, productId: string): Attempt | null {
  const rows = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.kind, "outside-check"), inArray(jobs.status, ["ok", "failed"])))
    .orderBy(desc(jobs.id))
    .limit(30)
    .all()
    .filter((job) => job.params.productId === productId);
  const [job] = rows;
  if (!job?.finishedAt) return null;
  if (job.status === "failed")
    return { status: "failed", error: job.error, at: job.finishedAt.getTime() };
  const skipped = job.result === "skipped" || job.result === "not_configured";
  return { status: skipped ? "skipped" : "ok", error: job.error, at: job.finishedAt.getTime() };
}

/** What the last attempt (scheduled or by hand, whichever is newer) says is wrong, if anything. */
function noticeFor(attempt: Attempt | null): OutsideNotice | null {
  if (!attempt) return null;
  if (attempt.status === "skipped") return attempt.error?.startsWith("budget:") ? "budget" : null;
  if (attempt.status === "ok") return null;
  if (attempt.error === TREG_REASONS.key) return "paused_key";
  if (attempt.error === TREG_REASONS.balance) return "paused_balance";
  if (attempt.error === TREG_REASONS.paused) return "paused";
  return "failed";
}

const newer = (a: Attempt | null, b: Attempt | null) =>
  a && b ? (a.at >= b.at ? a : b) : (a ?? b);

function rankChange(latest: number | null, before: number | null): RankChange {
  if (latest === before) return "same";
  if (latest === null) return "down";
  return before === null || latest < before ? "up" : "down";
}

function searchRows(queries: readonly string[], rows: StoredCheck<SerpRank>[]): SearchRow[] {
  return queries.map((query) => {
    const [latest, earlier] = rows.filter((r) => r.subject === query);
    if (!latest) {
      return {
        query,
        checked: false,
        position: null,
        url: null,
        checkedAt: null,
        change: null,
        before: null,
      };
    }
    const before = earlier ? { position: earlier.value.position } : null;
    return {
      query,
      checked: true,
      position: latest.value.position,
      url: latest.value.url,
      checkedAt: latest.checkedAt.toISOString(),
      change: before ? rankChange(latest.value.position, before.position) : "first",
      before,
    };
  });
}

function linksOf(domain: string, rows: StoredCheck<Backlinks>[]): OutsideView["links"] {
  const mine = rows.filter((r) => siteKey(r.subject) === domain);
  const [latest] = mine;
  if (!latest) return null;
  const earlier = mine.find((r) => r.checkedAt < latest.checkedAt);
  return {
    count: latest.value.referringDomains,
    change: earlier ? latest.value.referringDomains - earlier.value.referringDomains : null,
    checkedAt: latest.checkedAt.toISOString(),
  };
}

function aiOf(rows: StoredCheck<AiAnswer>[]): OutsideView["ai"] {
  const [first] = rows;
  if (!first) return null;
  const run = rows.filter((r) => r.checkedAt.getTime() === first.checkedAt.getTime());
  const tally = new Map<string, number>();
  for (const { value } of run) {
    for (const domain of value.citedDomains) tally.set(domain, (tally.get(domain) ?? 0) + 1);
  }
  const domains = [...tally]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_DOMAINS)
    .map(([domain]) => domain);
  return {
    asked: run.length,
    named: run.filter((r) => r.value.named).length,
    cited: run.filter((r) => r.value.cited).length,
    domains,
    checkedAt: first.checkedAt.toISOString(),
  };
}

function activeState(db: Db, productId: string): "queued" | "running" | null {
  const id = activeOutsideCheck(db, productId);
  if (id === null) return null;
  const job = db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id)).get();
  return job?.status === "running" ? "running" : "queued";
}

export type OutsideViewInput = {
  db: Db;
  config: Config;
  product: { id: string; url: string };
  tracking: ProductTracking | null;
  now: Date;
};

/** The section's data: what was found, or the plain reason there is nothing. */
export function outsideView({ db, config, product, tracking, now }: OutsideViewInput): OutsideView {
  const domain = siteKey(new URL(product.url).hostname);
  const check = {
    active: activeState(db, product.id),
    refusal: outsideCheckRefusal(db, config, now, product.id, tracking),
  };
  const empty = { notice: null, checkedAt: null, links: null, searches: [], ai: null, check };
  if (!tracking || tracking.queries.length + tracking.questions.length === 0) {
    return { ...empty, state: "no_searches" };
  }
  if (!config.HARBOUR_TREG_API_KEY) return { ...empty, state: "not_connected" };

  const links = linksOf(domain, readChecks(db, product.id, "backlinks", READ_DAYS, now));
  const searches = searchRows(
    tracking.queries,
    readChecks(db, product.id, "serp_rank", READ_DAYS, now),
  );
  const ai = aiOf(readChecks(db, product.id, "ai_answer", READ_DAYS, now));
  const notice = noticeFor(newer(scheduledAttempt(db, product.id), manualAttempt(db, product.id)));
  const times = [links?.checkedAt, ai?.checkedAt, ...searches.map((s) => s.checkedAt)].flatMap(
    (t) => (t ? [t] : []),
  );
  const checkedAt = times.sort().at(-1) ?? null;
  const any = links !== null || ai !== null || searches.some((s) => s.checked);
  return { state: any ? "ready" : "not_checked", notice, checkedAt, links, searches, ai, check };
}
