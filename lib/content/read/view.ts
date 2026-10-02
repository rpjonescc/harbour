import { readdirSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { contentPaths } from "@/lib/content/paths";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { addDays } from "@/lib/format/zoned-time";
import type { ContentProduct } from "@/lib/products/content";
import { type FailedStep, ideaActivity, stepSentence } from "./chain-status";
import { type IdeaEntry, scanContent } from "./scan";
import { pieceView, rollup } from "./view-pieces";
import { type ContentView, type IdeaView, type PieceView, TABS, type TabId } from "./view-types";
import { readVoice } from "./voice";

export { type ContentView, type IdeaView, type PieceView, TABS, type TabId } from "./view-types";

const DIGEST_FRESH_DAYS = 3;

type Activity = { active: boolean; failed: FailedStep | null };

function ideaView(
  entry: IdeaEntry,
  pieces: PieceView[],
  activity: Activity,
  saving: ReadonlySet<string>,
): IdeaView {
  const { idea, product } = entry;
  const { front } = idea;
  // An idea with no pieces yet (waiting, or picked and not yet split) carries its own status;
  // once it has pieces, each piece does.
  const bare = front.state === "idea" || (front.state === "drafting" && pieces.length === 0);
  const failed = bare && !activity.active ? activity.failed : null;
  const tab: TabId | null =
    front.state === "discarded"
      ? "discarded"
      : !bare
        ? null
        : activity.active
          ? "writing"
          : failed && front.state === "drafting"
            ? "needs-you"
            : front.state === "idea"
              ? "ideas"
              : "writing";
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
    retry: failed !== null,
    saving: saving.has(idea.id),
    pieces,
    rollup: rollup(pieces),
    note: front.needsYou ?? (failed ? stepSentence(failed.kind, failed.params) : null),
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
  } catch {
    // A missing or unreadable folder both mean no digest could be found, which is what the line says.
    return true;
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
  const scan = scanContent(root, products, { gates: true });
  const activity = ideaActivity(
    db,
    scan.entries.map((e) => e.idea.id),
  );
  const saving = savingSet(db);
  const ideas = scan.entries.map((entry) => {
    const state = activity.get(entry.idea.id) ?? { active: false, failed: null };
    const views = (scan.pieces.get(entry.idea.id) ?? []).map((p) =>
      pieceView(p, state.failed, saving),
    );
    return ideaView(entry, views, state, saving);
  });
  const tabs = tabsOf(ideas);
  const defaultTab =
    TABS.find((t) => (tabs.find((x) => x.id === t.id)?.count ?? 0) > 0)?.id ?? "ideas";
  return {
    tabs,
    defaultTab,
    ideas,
    capped: scan.capped,
    unreadable: scan.unreadable,
    folderError: scan.folderError,
    tokenSet: input.tokenSet,
    digest: { gap: digestGap(root, input.today) },
    voice: products.map((p) => voiceStatus(root, p)),
  };
}

function voiceStatus(root: string, product: ContentProduct): ContentView["voice"][number] {
  const base = { productId: product.id, name: product.name };
  try {
    const voice = readVoice(root, product.id);
    return {
      ...base,
      state: voice.state,
      ...(voice.state === "invalid" ? { reason: voice.reason } : {}),
    };
  } catch {
    return { ...base, state: "invalid", reason: "Harbour couldn't read the voice profile." };
  }
}
