// The whole tower for one render: every tile read through loadTile, so one failing reader never
// takes the page down, and the headline built from whatever could be read.

import type { Config } from "@/lib/config";
import type { ContentScan } from "@/lib/content/read/scan";
import type { Db } from "@/lib/db/client";
import type { Briefing } from "@/lib/explain/briefing";
import { towerHeadlineParts } from "@/lib/explain/tower";
import { isJobDue } from "@/lib/jobs/queue";
import { noteEnabled } from "@/lib/note/schedule";
import { type NoteSlot, noteSlot } from "@/lib/note/view";
import { backupStatus } from "@/lib/ops/backup-status";
import { getContentProducts, type Product } from "@/lib/products/catalog";
import type { ContentProduct } from "@/lib/products/content";
import { todaySummary } from "@/lib/today/from-scans";
import type { TodaySummary } from "@/lib/today/types";
import { loadWorkStrip, type WorkStrip } from "@/lib/today/work-strip";
import { type ActivityFeed, activityFeed } from "./activity";
import { activityFacts } from "./activity-data";
import { towerContentScan } from "./content-data";
import { loadTile, type TileResult } from "./load-tile";
import { type NeedItem, needsYou } from "./needs";
import { needsFacts } from "./needs-data";
import { type RunwayCard, runwayCard } from "./runway";
import { runwayFacts } from "./runway-data";
import { type Lights, systemLights } from "./system";
import { systemFacts } from "./system-data";
import { troubleLights } from "./trouble";
import { type WeekWins, weekWins } from "./wins";
import { winsFacts } from "./wins-data";

export type TowerNeeds = { items: NeedItem[]; more: number; moreHref: string | null };

export type Tower = {
  /** The h1's lead: is everything OK? A red (`act`) light always leads it. */
  headline: string;
  /** The h1's second sentence, what needs the owner: the page's only live region. */
  subline: string;
  systems: TileResult<Lights>;
  needs: TileResult<TowerNeeds>;
  work: TileResult<WorkStrip>;
  runways: TileResult<RunwayCard[]>;
  /** Leads "Your products"; null when it could not be read (the runways tile then says so). */
  briefing: Briefing | null;
  isSample: boolean;
  activity: TileResult<ActivityFeed>;
  wins: TileResult<WeekWins>;
  /** The daily note beside Needs you; null data when the personality is quiet. */
  note: TileResult<NoteSlot | null>;
  /** A check or job is running or due to start: the page refreshes more often. */
  active: boolean;
};

/** Reads once and remembers the result or the throw, so tiles share one content read. */
function once<T>(read: () => T): () => T {
  let memo: { value: T } | { error: unknown } | null = null;
  return () => {
    if (memo === null) {
      try {
        memo = { value: read() };
      } catch (error) {
        memo = { error };
      }
    }
    if ("error" in memo) throw memo.error;
    return memo.value;
  };
}

type Ctx = {
  db: Db;
  config: Config;
  products: readonly Product[];
  now: Date;
  contentProducts: readonly ContentProduct[];
};

/** One card per product; before the first check the verdicts are the labelled sample's. */
function runwayCards(ctx: Ctx, summary: TodaySummary, content: () => ContentScan | null) {
  const { db, config, products, now } = ctx;
  // Only products with content on get a content line (the scan also holds content-only work).
  const contentIds = new Set(ctx.contentProducts.map((p) => p.id));
  return products.map((product) => {
    const scan = contentIds.has(product.id) ? content() : null;
    const facts = runwayFacts(db, config, product, scan, now);
    const sample = summary.isSample
      ? summary.scores.find((row) => row.productId === product.id)
      : undefined;
    const shown = sample ? { ...facts, today: { ...facts.today, row: sample } } : facts;
    return runwayCard(shown, now, config.HARBOUR_TIMEZONE, config.HARBOUR_LOCALE);
  });
}

/** The note card's slot. Without a token the worker skips the scheduled note, so none is promised. */
function readNote({ db, config, now }: Ctx, isSample: boolean): NoteSlot | null {
  const tokenSet = Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN);
  return noteSlot({
    db,
    personality: config.HARBOUR_PERSONALITY,
    isSample,
    root: config.HARBOUR_BRAIN_DIR,
    timeZone: config.HARBOUR_TIMEZONE,
    noteTime: config.HARBOUR_NOTE_TIME,
    scheduled: noteEnabled(config) && tokenSet,
    tokenSet,
    now,
  });
}

/** Everything the tower shows, each tile isolated: a throw becomes that tile's plain failure. */
export function loadTower(
  db: Db,
  config: Config,
  products: readonly Product[],
  now: Date,
  contentProducts: readonly ContentProduct[] = getContentProducts(),
): Tower {
  const ctx: Ctx = { db, config, products, now, contentProducts };
  const { HARBOUR_TIMEZONE: timeZone, HARBOUR_LOCALE: locale } = config;
  const content = once(() => towerContentScan(config, contentProducts));

  const system = loadTile("systems", () => {
    const facts = systemFacts(db, config, products, now);
    return { facts, lights: systemLights(facts, now, timeZone, locale) };
  });
  const systems: TileResult<Lights> = system.ok ? { ok: true, data: system.data.lights } : system;
  const work = loadTile("work", () => loadWorkStrip(db, now, timeZone, products));
  const needs = loadTile("needs", () =>
    needsYou(
      needsFacts(db, products, now, content()),
      systems.ok ? systems.data.lights : [],
      work.ok ? work.data.needsYou : null,
    ),
  );
  const summary = loadTile("briefing", () =>
    todaySummary(db, products, now, backupStatus(db, config, now).health),
  );
  const runways = summary.ok
    ? loadTile("products", () => runwayCards(ctx, summary.data, content))
    : summary;
  const activity = loadTile("activity", () =>
    activityFeed(activityFacts(db, products, config, now), products, now, timeZone, locale),
  );
  const wins = loadTile("wins", () =>
    weekWins(winsFacts(db, config, products, now, content()), products, timeZone, locale),
  );

  const note = loadTile("note", () => readNote(ctx, summary.ok && summary.data.isSample));

  const lights = systems.ok ? systems.data : null;
  const trouble = lights ? troubleLights(lights.lights) : null;
  const { lead, subline } = towerHeadlineParts({
    // Only a red light leads the headline: it is also the first item in Needs you.
    worst: lights?.worst?.tone === "act" ? lights.worst : null,
    needsCount: needs.ok ? needs.data.items.length + needs.data.more : null,
    looks: trouble ? trouble.shown.length + trouble.more : 0,
    systemsRead: systems.ok,
  });
  const facts = system.ok ? system.data.facts : null;
  // A job deferred for later (the owner is editing the brain, another chain runs) is not activity:
  // counting it would keep the 15 s refresh going until the page pauses itself.
  const active =
    (facts?.checks.some((c) => c.scanning) ?? false) ||
    (facts
      ? facts.agents.running.length > 0 || facts.agents.queued.some((job) => isJobDue(job, now))
      : false) ||
    (summary.ok && summary.data.scanning) ||
    (activity.ok && activity.data.busy);
  return {
    headline: lead,
    subline,
    systems,
    needs,
    work,
    runways,
    briefing: summary.ok ? summary.data.briefing : null,
    isSample: summary.ok && summary.data.isSample,
    activity,
    wins,
    note,
    active,
  };
}
