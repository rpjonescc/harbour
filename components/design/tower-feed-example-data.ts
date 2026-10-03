// Fictional "What's happening" and "Wins this week" data for /design and the tile tests.
// Sentences come from the same lib/explain builders the real tower uses.

import { NOTHING_RAN, QUIET_WEEK } from "@/lib/explain/tower";
import { FEED_SENTENCE, WIN_LINE } from "@/lib/explain/tower-activity";
import type { ActivityFeed, FeedItem } from "@/lib/tower/activity";
import type { TileResult } from "@/lib/tower/load-tile";
import type { WeekWins } from "@/lib/tower/wins";

const AT = new Date("2026-10-02T09:00:00Z");

const item = (
  id: string,
  kind: FeedItem["kind"],
  sentence: string,
  ago: string,
  isNew = false,
): FeedItem => ({ id, kind, sentence, at: AT, ago, href: `/agents/${id}`, isNew });

export const RUNNING_ITEMS: FeedItem[] = [
  item("31", "running", FEED_SENTENCE.running("Checking Acme Docs"), "4 min ago", true),
  item(
    "32",
    "running",
    FEED_SENTENCE.waiting("Claude is drafting a post for Acme Blog"),
    "1 min ago",
  ),
];

/** Wins first, then ordinary finishes, then the failure last (the shaper's order). */
export const FINISHED_ITEMS: FeedItem[] = [
  item("27", "win", FEED_SENTENCE.rise("Acme Docs", "Found on Google", 6), "just now", true),
  item("26", "win", FEED_SENTENCE.done("Claude wrote the weekly report"), "2 h ago"),
  item("25", "finished", FEED_SENTENCE.done("Backing up Harbour"), "6 h ago"),
  item("24", "finished", FEED_SENTENCE.done("Checking Acme Blog"), "7 h ago"),
  item("23", "failed", FEED_SENTENCE.failed("Claude's ideas run for Acme Blog"), "9 h ago"),
];

const feed = (over: Partial<ActivityFeed>): TileResult<ActivityFeed> => ({
  ok: true,
  data: { running: [], finished: [], more: 0, empty: null, ...over },
});

export const FEED_EXAMPLES: { label: string; result: TileResult<ActivityFeed> }[] = [
  {
    label: "What's happening · running, wins first, 3 more",
    result: feed({ running: RUNNING_ITEMS, finished: FINISHED_ITEMS, more: 3 }),
  },
  {
    label: "What's happening · nothing running now",
    result: feed({ finished: FINISHED_ITEMS.slice(2, 4) }),
  },
  { label: "What's happening · a quiet day", result: feed({ empty: NOTHING_RAN("06:00") }) },
];

const DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
const bars = (counts: number[]) =>
  DAYS.map((label, i) => ({ day: `2026-09-${26 + i}`, label, count: counts[i] ?? 0 }));

export const BUSY_WEEK: WeekWins = {
  lines: [
    WIN_LINE.cardsFinished(9, 4),
    WIN_LINE.wentFrom("Acme Docs", "Found on Google", "Fair", "Good"),
    WIN_LINE.upBy("Acme Blog", "Recommended by AI assistants", 6),
    WIN_LINE.newlyInGoogle("Acme Docs", 5),
    WIN_LINE.approved(2),
  ],
  bars: bars([1, 0, 3, 2, 0, 1, 2]),
  quiet: null,
};

export const QUIET_WEEK_WINS: WeekWins = { lines: [], bars: bars([]), quiet: QUIET_WEEK };

export const WINS_EXAMPLES: { label: string; result: TileResult<WeekWins> }[] = [
  { label: "Wins this week · a busy week", result: { ok: true, data: BUSY_WEEK } },
  { label: "Wins this week · a quiet week", result: { ok: true, data: QUIET_WEEK_WINS } },
];
