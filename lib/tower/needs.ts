// "Needs you": at most five items, each one sentence and one link, in the spec's priority order
// (§4.4). Pure: no I/O.

import { jobLabel } from "@/lib/agents/view";
import { NEED_BUTTON, NEED_SENTENCE, needButtonName } from "@/lib/explain/tower-needs";
import type { NeedsFacts } from "./needs-data";
import type { Light } from "./system";

/** At most this many items show; the rest are counted in `more`. */
export const NEEDS_CAP = 5;

/** The Board's "Needs you" (its work strip's shape), declared here so the tower stays apart. */
export type BoardNeeds = { count: number; href: string } | null;

export type NeedItem = {
  kind: "system" | "review" | "ideas" | "content" | "approvals" | "run";
  sentence: string;
  button: { label: string; href: string; name: string };
  since: Date | null;
};

const item = (
  kind: NeedItem["kind"],
  sentence: string,
  label: string,
  href: string,
  since: Date | null = null,
): NeedItem => ({
  kind,
  sentence,
  button: { label, href, name: needButtonName(label, sentence) },
  since,
});

const BACKLOG_HREF = "/actions?view=board";

/** Every candidate, in priority order (then oldest first within a kind). */
function candidates(facts: NeedsFacts, lights: readonly Light[], board: BoardNeeds): NeedItem[] {
  const system = lights
    .filter((l) => l.tone === "act")
    .map((l) => item("system", l.sentence, NEED_BUTTON.fix, l.href ?? "/settings"));
  // The Board counts new ideas too; they are their own item below, so they are not counted twice.
  const reviews = board === null ? 0 : Math.max(0, board.count - facts.suggested.count);
  const review =
    board !== null && reviews > 0
      ? [item("review", NEED_SENTENCE.review(reviews), NEED_BUTTON.review, board.href)]
      : [];
  const { count, oldest } = facts.suggested;
  const ideas =
    count > 0
      ? [item("ideas", NEED_SENTENCE.ideas(count), NEED_BUTTON.decide, BACKLOG_HREF, oldest)]
      : [];
  const content = facts.content;
  const pieces = [
    ...(content && content.needsYou > 0
      ? [
          item(
            "content",
            NEED_SENTENCE.contentNeedsYou(content.needsYou),
            NEED_BUTTON.open,
            "/content",
          ),
        ]
      : []),
    ...(content && content.ready > 0
      ? [item("content", NEED_SENTENCE.contentReady(content.ready), NEED_BUTTON.open, "/content")]
      : []),
  ];
  const approvals = facts.approvals.map((a) =>
    item(
      "approvals",
      NEED_SENTENCE.approvals(a.count, a.productName),
      NEED_BUTTON.review,
      `/settings/products/${a.productId}`,
    ),
  );
  const runs = [...facts.failedRuns]
    .sort((a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0))
    .map((job) =>
      item(
        "run",
        NEED_SENTENCE.run(jobLabel(job, facts.products)),
        NEED_BUTTON.run,
        `/agents/${job.id}`,
        job.finishedAt,
      ),
    );
  return [...system, ...review, ...ideas, ...pieces, ...approvals, ...runs];
}

/** Where a hidden item waits: the Board's Needs you holds reviews and ideas, Agents every run. */
const BOARD_NEEDS_HREF = `${BACKLOG_HREF}&focus=needs-you`;
const homeOf = (item: NeedItem): string =>
  item.kind === "review" || item.kind === "ideas"
    ? BOARD_NEEDS_HREF
    : item.kind === "run"
      ? "/agents"
      : item.button.href;

/**
 * The first five things that need the owner, how many more there are, and where those wait when
 * it is one place (else null: the "N more" line stays plain text rather than point at one of many).
 */
export function needsYou(
  facts: NeedsFacts,
  lights: readonly Light[],
  board: BoardNeeds,
): { items: NeedItem[]; more: number; moreHref: string | null } {
  const all = candidates(facts, lights, board);
  const homes = new Set(all.slice(NEEDS_CAP).map(homeOf));
  const [only] = homes;
  return {
    items: all.slice(0, NEEDS_CAP),
    more: Math.max(0, all.length - NEEDS_CAP),
    moreHref: homes.size === 1 && only !== undefined ? only : null,
  };
}
