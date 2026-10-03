// Fictional control tower data for /design and the tile tests: systems, needs you and runways.
// Sentences come from the same lib/explain builders the real tower uses.

import { BACKUP_HEALTH_LABEL } from "@/lib/explain/backups";
import { sourceTrouble } from "@/lib/explain/sources";
import { NO_PAID_DATA } from "@/lib/explain/spend";
import { SECTION_TITLES } from "@/lib/explain/tower";
import {
  AGENTS_SENTENCE,
  CHECK_SENTENCE,
  SCHEDULE_SENTENCE,
  SOURCES_SENTENCE,
  SPEND_SENTENCE,
  WEBSITE_UP,
  WORKER_SENTENCE,
} from "@/lib/explain/tower-lights";
import { NEED_BUTTON, NEED_SENTENCE, needButtonName } from "@/lib/explain/tower-needs";
import { claudeTouchLine, RUNWAY_HIGHLIGHT } from "@/lib/explain/tower-runway";
import { GAP_REASONS, verdictFor } from "@/lib/explain/verdict";
import type { TileResult } from "@/lib/tower/load-tile";
import type { NeedItem } from "@/lib/tower/needs";
import type { RunwayCard } from "@/lib/tower/runway";
import type { Light, Lights } from "@/lib/tower/system";

const light = (id: Light["id"], tone: Light["tone"], sentence: string, href: string | null) => ({
  id,
  tone,
  sentence,
  href,
});

/** Every light fine, one checking now, the backups switched off on purpose. */
export const CALM_LIGHTS: Light[] = [
  light("website", "ok", WEBSITE_UP("since Tuesday"), null),
  light("worker", "ok", WORKER_SENTENCE.ok, "https://example.com/docs/deploy"),
  light("schedules", "ok", SCHEDULE_SENTENCE.allRan(4), "/settings"),
  light("checks", "busy", CHECK_SENTENCE.running, "/settings/sources"),
  light("backups", "off", `${BACKUP_HEALTH_LABEL.off}.`, "/settings#backups"),
  light("sources", "ok", SOURCES_SENTENCE.ok, "/settings/sources"),
  light("agents", "ok", AGENTS_SENTENCE.idle(3), "/agents"),
  light("spend", "ok", NO_PAID_DATA, "/settings"),
];

/** Every tone at once: two lights need the owner, two are worth a look, one can't tell. */
export const TROUBLED_LIGHTS: Light[] = [
  light("website", "ok", WEBSITE_UP("since 09:12"), null),
  light("worker", "act", WORKER_SENTENCE.stopped, "https://example.com/docs/deploy"),
  light("schedules", "watch", SCHEDULE_SENTENCE.late("Weekly report", "on 21 Sept"), "/settings"),
  light("checks", "act", CHECK_SENTENCE.failed(["Acme Blog"], false), "/settings/sources"),
  light("backups", "unknown", `${BACKUP_HEALTH_LABEL.unreadable}.`, "/settings#backups"),
  light(
    "sources",
    "watch",
    `${sourceTrouble([{ collector: "search-console" }])}.`,
    "/settings/sources",
  ),
  light("agents", "busy", AGENTS_SENTENCE.running("Checking Acme Docs", 0), "/agents"),
  light("spend", "watch", SPEND_SENTENCE.nearBudget(80), "/settings"),
];

const lightsOf = (lights: Light[]): TileResult<Lights> => ({
  ok: true,
  data: { lights, worst: lights.find((l) => l.tone === "act") ?? null },
});

export const SYSTEM_EXAMPLES: { label: string; result: TileResult<Lights> }[] = [
  { label: "Systems · nothing needs a look, one checking, one off", result: lightsOf(CALM_LIGHTS) },
  { label: "Systems · every tone, worst first", result: lightsOf(TROUBLED_LIGHTS) },
  {
    label: "Systems · six need a look (five shown, one more)",
    result: lightsOf(
      TROUBLED_LIGHTS.map((l) => (l.id === "website" ? l : { ...l, tone: "watch" })),
    ),
  },
];

const need = (kind: NeedItem["kind"], sentence: string, label: string, href: string) => ({
  kind,
  sentence,
  button: { label, href, name: needButtonName(label, sentence) },
  since: null,
});

export const NEED_ITEMS: NeedItem[] = [
  need("system", WORKER_SENTENCE.stopped, NEED_BUTTON.fix, "https://example.com/docs/deploy"),
  need("review", NEED_SENTENCE.review(2), NEED_BUTTON.review, "/actions?view=board"),
  need("ideas", NEED_SENTENCE.ideas(3), NEED_BUTTON.decide, "/actions?view=board"),
  need("content", NEED_SENTENCE.contentReady(2), NEED_BUTTON.open, "/content"),
  need(
    "approvals",
    NEED_SENTENCE.approvals(4, "Acme Docs"),
    NEED_BUTTON.review,
    "/settings/products/acme-docs",
  ),
];

export const NEEDS_EXAMPLES: {
  label: string;
  result: TileResult<{ items: NeedItem[]; more: number }>;
}[] = [
  {
    label: "Needs you · five, and 2 more",
    result: { ok: true, data: { items: NEED_ITEMS, more: 2 } },
  },
  {
    label: "Needs you · one thing",
    result: { ok: true, data: { items: NEED_ITEMS.slice(2, 3), more: 0 } },
  },
  { label: "Needs you · nothing (a win)", result: { ok: true, data: { items: [], more: 0 } } },
];

export const DOCS_CARD: RunwayCard = {
  productId: "acme-docs",
  name: "Acme Docs",
  hue: "amber",
  verdict: verdictFor(76),
  trend: { direction: "up", phrase: "up 4 since last week" },
  next: { title: "Add a sitemap", href: "/actions#action-12" },
  checked: { phrase: CHECK_SENTENCE.fresh("3 h ago"), tone: "ok" },
  highlights: [
    { term: "indexed", text: RUNWAY_HIGHLIGHT.inGoogle(3, 53) },
    { term: "cited", text: RUNWAY_HIGHLIGHT.aiNamed(1, 5) },
    { term: "links-to-you", text: RUNWAY_HIGHLIGHT.linksToYou(4) },
  ],
  contentLine: "2 drafts ready for you · 1 being written · 4 ideas waiting",
  claudeLine: claudeTouchLine("2 h ago"),
};

/** A card with gaps: no score yet, no trend, nothing open, late check, no highlights, no content. */
export const BLOG_CARD: RunwayCard = {
  productId: "acme-blog",
  name: "Acme Blog",
  hue: "teal",
  verdict: verdictFor(null, GAP_REASONS.dataMissing),
  trend: { direction: null, phrase: null },
  next: null,
  checked: { phrase: CHECK_SENTENCE.late("on 29 Sept", null), tone: "watch" },
  highlights: [],
  contentLine: null,
  claudeLine: claudeTouchLine(null),
};

export const FALLING_CARD: RunwayCard = {
  ...DOCS_CARD,
  productId: "acme-shop",
  name: "Acme Shop",
  hue: "violet",
  verdict: verdictFor(58),
  trend: { direction: "down", phrase: "down 3 since last week" },
  checked: { phrase: CHECK_SENTENCE.running, tone: "busy" },
  highlights: DOCS_CARD.highlights.slice(0, 1),
  contentLine: null,
};

export const EXAMPLE_BRIEFING = {
  sentence: "Your sites are in good shape. The biggest win is a sitemap for Acme Docs.",
  subLine: "3 things worth doing across 2 sites.",
};

export const FAILED_TILE = {
  tile: SECTION_TITLES.products,
  detail: "SqliteError: database is locked",
} as const;
