// The "What's happening" feed (spec §4.7): what runs now, and what finished in the last day with
// wins first and failures last. Pure: no I/O, no clock.

import { boardColumn } from "@/lib/actions/board-column";
import { ACTION_STATUSES, type ActionStatus } from "@/lib/actions/types";
import { jobLabel, type Named } from "@/lib/agents/view";
import { AREAS } from "@/lib/explain/areas";
import { movedTodayLine } from "@/lib/explain/board";
import { agoPhrase, NOTHING_RAN } from "@/lib/explain/tower";
import { FEED_SENTENCE } from "@/lib/explain/tower-activity";
import { formatShortDateTime } from "@/lib/format/date";
import { isAgentJobKind } from "@/lib/jobs/job-kinds";
import type { Job } from "@/lib/jobs/queue";
import { actionHref } from "@/lib/today/from-actions";
import type { ActivityFacts, CardMove, ScoreRise } from "./activity-data";

export type FeedItem = {
  id: string;
  kind: "win" | "finished" | "failed" | "running";
  sentence: string;
  at: Date;
  ago: string;
  href: string | null;
  /** Under 5 minutes old: the tile tints it once and says "new". */
  isNew: boolean;
};

export type ActivityFeed = {
  running: FeedItem[];
  /** At most 5: wins first, then ordinary finishes, then failures; newest first in each. */
  finished: FeedItem[];
  more: number;
  /** The sentence for a day with nothing running or finished; null otherwise. */
  empty: string | null;
};

/** At most this many items show in each group; the rest are counted. */
export const FEED_CAP = 5;
const NEW_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const GROUP_ORDER: readonly FeedItem["kind"][] = ["win", "finished", "failed"];

type Context = { products: readonly Named[]; now: Date; timeZone: string; locale: string };

function feedItem(ctx: Context, base: Omit<FeedItem, "ago" | "isNew">): FeedItem {
  const age = ctx.now.getTime() - base.at.getTime();
  return {
    ...base,
    ago: agoPhrase(base.at, ctx.now, ctx.timeZone, ctx.locale),
    isNew: age < NEW_MS,
  };
}

function runningItem(ctx: Context, job: Job): FeedItem {
  const label = jobLabel(job, ctx.products);
  const running = job.status === "running";
  return feedItem(ctx, {
    id: `job-${job.id}`,
    kind: "running",
    sentence: running ? FEED_SENTENCE.running(label) : FEED_SENTENCE.waiting(label),
    at: running ? (job.startedAt ?? job.createdAt) : job.createdAt,
    href: `/agents/${job.id}`,
  });
}

function finishedItem(ctx: Context, job: Job): FeedItem {
  const label = jobLabel(job, ctx.products);
  const ok = job.status === "ok";
  return feedItem(ctx, {
    id: `job-${job.id}`,
    kind: !ok ? "failed" : isAgentJobKind(job.kind) ? "win" : "finished",
    sentence: ok ? FEED_SENTENCE.done(label) : FEED_SENTENCE.failed(label),
    at: job.finishedAt ?? job.createdAt,
    href: `/agents/${job.id}`,
  });
}

const isStatus = (value: string): value is ActionStatus =>
  (ACTION_STATUSES as readonly string[]).includes(value);

function moveItem(ctx: Context, move: CardMove): FeedItem {
  const to = isStatus(move.toStatus)
    ? boardColumn({ status: move.toStatus, stage: move.toStage, prUrl: null })
    : null;
  return feedItem(ctx, {
    id: `move-${move.actionId}-${move.at.getTime()}`,
    kind: to === "done" ? "win" : "finished",
    sentence: movedTodayLine({ actor: move.actor, title: move.title, to }),
    at: move.at,
    href: actionHref(move.actionId),
  });
}

function riseItem(ctx: Context, rise: ScoreRise): FeedItem {
  const name = ctx.products.find((p) => p.id === rise.productId)?.name ?? rise.productId;
  return feedItem(ctx, {
    id: `rise-${rise.productId}-${rise.area}`,
    kind: "win",
    sentence: FEED_SENTENCE.rise(name, AREAS[rise.area].name, rise.to - rise.from),
    at: rise.at,
    href: `/products/${rise.productId}`,
  });
}

/** "06:00" within a day, else "4 Oct, 06:00", in the owner's zone. */
function whenNext(next: Date, ctx: Context): string {
  if (next.getTime() - ctx.now.getTime() >= DAY_MS) {
    return formatShortDateTime(next, ctx.timeZone, ctx.locale);
  }
  return new Intl.DateTimeFormat(ctx.locale, {
    timeZone: ctx.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(next);
}

/** The feed: running now, then up to five finished items, and the empty sentence when quiet. */
export function activityFeed(
  facts: ActivityFacts,
  products: readonly Named[],
  now: Date,
  timeZone: string,
  locale: string,
): ActivityFeed {
  const ctx: Context = { products, now, timeZone, locale };
  const running = [...facts.running, ...facts.queued].map((job) => runningItem(ctx, job));
  const finished = [
    ...facts.finished.map((job) => finishedItem(ctx, job)),
    ...facts.moves.map((move) => moveItem(ctx, move)),
    ...facts.scoreRises.map((rise) => riseItem(ctx, rise)),
  ].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) || b.at.getTime() - a.at.getTime(),
  );
  const quiet = running.length === 0 && finished.length === 0;
  const next = facts.nextRun === null ? null : whenNext(facts.nextRun, ctx);
  return {
    running,
    finished: finished.slice(0, FEED_CAP),
    more: Math.max(0, finished.length - FEED_CAP),
    empty: quiet ? NOTHING_RAN(next) : null,
  };
}
