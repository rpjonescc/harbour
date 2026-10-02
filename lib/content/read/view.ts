import { readdirSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { contentPaths } from "@/lib/content/paths";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { addDays } from "@/lib/format/zoned-time";
import type { ContentProduct } from "@/lib/products/content";
import { type FailedStep, ideaActivity, stepSentence } from "./chain-status";
import { type ReadIdea, readIdeas } from "./ideas";
import { readPieces } from "./pieces";
import { pieceView, rollup } from "./view-pieces";
import { type ContentView, type IdeaView, type PieceView, TABS, type TabId } from "./view-types";
import { readVoice } from "./voice";

export { type ContentView, type IdeaView, type PieceView, TABS, type TabId } from "./view-types";

const MAX_IDEAS = 200;
const MAX_PIECES = 600;
/** Extra files read per product so a few broken ones can't hide that more than 200 ideas exist. */
const BROKEN_FILE_SLACK = 10;
const DIGEST_FRESH_DAYS = 3;

type Activity = { active: boolean; failed: FailedStep | null };

function ideaView(
  entry: { idea: ReadIdea; product: ContentProduct },
  pieces: PieceView[],
  activity: Activity,
  saving: ReadonlySet<string>,
): IdeaView {
  const { idea, product } = entry;
  const { front } = idea;
  const waiting = front.state === "idea";
  const tab: TabId | null =
    front.state === "discarded"
      ? "discarded"
      : waiting
        ? activity.active
          ? "writing"
          : "ideas"
        : null;
  const retry = waiting && !activity.active && activity.failed !== null;
  return {
    id: idea.id,
    productId: product.id,
    productName: product.name,
    title: front.title,
    why: front.why,
    pillar: front.pillar,
    angle: front.angle,
    audienceQuestion: front.audienceQuestion,
    sources: front.sources,
    created: front.created,
    tab,
    retry,
    saving: saving.has(idea.id),
    pieces,
    rollup: rollup(pieces),
    note:
      front.needsYou ??
      (retry && activity.failed
        ? stepSentence(activity.failed.kind, activity.failed.params)
        : null),
  };
}

/** Ids (pieces and ideas) with a decision queued or running: the page shows "Saving". */
function savingSet(db: Db): Set<string> {
  const rows = db
    .select({ params: jobs.params })
    .from(jobs)
    .where(and(eq(jobs.kind, "content-decision"), inArray(jobs.status, ["queued", "running"])))
    .all();
  return new Set(
    rows.flatMap(({ params }) =>
      [params.pieceId, params.ideaId].filter((v): v is string => Boolean(v)),
    ),
  );
}

/** True when there is no digest from the last few days (a gap, said calmly on the page). */
function digestGap(root: string, today: string): boolean {
  try {
    const newest = readdirSync(`${root}/${contentPaths.digestDir}`)
      .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
      .sort()
      .at(-1);
    return newest === undefined || newest.slice(0, 10) < addDays(today, -DIGEST_FRESH_DAYS);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

function tabsOf(ideas: IdeaView[]): ContentView["tabs"] {
  return TABS.map(({ id, label }) => ({
    id,
    label,
    count: ideas.reduce(
      (n, i) => n + (i.tab === id ? 1 : 0) + i.pieces.filter((p) => p.tab === id).length,
      0,
    ),
  }));
}

/**
 * Everything the Content page shows, read from the brain and the jobs table (never written).
 * Caps: the newest 200 ideas and 600 pieces. A drafting piece is Being written while a step is
 * under way, and Needs you (with a retry) when the idea's newest step failed (Decision 4).
 */
export function contentView(input: {
  db: Db;
  root: string;
  products: readonly ContentProduct[];
  today: string;
  tokenSet: boolean;
}): ContentView {
  const { db, root, products } = input;
  const unreadable: string[] = [];
  const entries = products.flatMap((product) => {
    const read = readIdeas(root, product.id, MAX_IDEAS + 1 + BROKEN_FILE_SLACK);
    unreadable.push(...read.unreadable);
    return read.ideas.map((idea) => ({ idea, product }));
  });
  entries.sort(
    (a, b) =>
      b.idea.front.created.localeCompare(a.idea.front.created) ||
      b.idea.id.localeCompare(a.idea.id),
  );
  let capped = entries.length > MAX_IDEAS;
  const shown = entries.slice(0, MAX_IDEAS);
  const activity = ideaActivity(
    db,
    shown.map((e) => e.idea.id),
  );
  const saving = savingSet(db);
  let budget = MAX_PIECES;
  const ideas = shown.map((entry) => {
    const state = activity.get(entry.idea.id) ?? { active: false, failed: null };
    const read =
      // A waiting idea has no pieces yet; a discarded idea shows as one card, not as its pieces.
      ["idea", "discarded"].includes(entry.idea.front.state) || budget <= 0
        ? { pieces: [], unreadable: [] }
        : readPieces(root, entry.idea.id);
    unreadable.push(...read.unreadable);
    if (read.pieces.length > budget) capped = true;
    const views = read.pieces.slice(0, budget).map((p) => pieceView(p, state.failed, saving));
    budget -= views.length;
    return ideaView(entry, views, state, saving);
  });
  const tabs = tabsOf(ideas);
  const defaultTab =
    TABS.find((t) => (tabs.find((x) => x.id === t.id)?.count ?? 0) > 0)?.id ?? "ideas";
  return {
    tabs,
    defaultTab,
    ideas,
    capped,
    unreadable,
    tokenSet: input.tokenSet,
    digest: { gap: digestGap(root, input.today) },
    voice: products.map((p) => {
      const voice = readVoice(root, p.id);
      return {
        productId: p.id,
        name: p.name,
        state: voice.state,
        ...(voice.state === "invalid" ? { reason: voice.reason } : {}),
      };
    }),
  };
}
