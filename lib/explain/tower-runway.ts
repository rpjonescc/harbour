// The words on each product's runway card (spec §4.6). Numbers stay small beside a sentence, and
// a highlight with no data is left out, never shown as zero.

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The weekly change in words; arrows on the card always sit beside these. */
export function weekTrendPhrase(change: number): string {
  if (change === 0) return "steady";
  return `${change > 0 ? "up" : "down"} ${Math.abs(change)} since last week`;
}

export const RUNWAY_HIGHLIGHT = {
  inGoogle: (indexed: number, checked: number) => `In Google: ${indexed} of ${checked} pages`,
  aiNamed: (named: number, asked: number) =>
    `ChatGPT and others named you in ${named} of ${asked} ${plural(asked, "answer", "answers")}`,
  linksToYou: (count: number) => `${count} ${plural(count, "site links", "sites link")} to you`,
} as const;

/** "2 drafts ready for you · 1 being written · 4 ideas waiting"; null when every count is zero. */
export function runwayContentLine(counts: {
  ready: number;
  needsYou: number;
  writing: number;
  ideas: number;
}): string | null {
  const parts = [
    counts.ready > 0 && `${counts.ready} ${plural(counts.ready, "draft", "drafts")} ready for you`,
    counts.needsYou > 0 &&
      `${counts.needsYou} ${plural(counts.needsYou, "draft needs", "drafts need")} you`,
    counts.writing > 0 && `${counts.writing} being written`,
    counts.ideas > 0 && `${counts.ideas} ${plural(counts.ideas, "idea", "ideas")} waiting`,
  ].filter((part): part is string => typeof part === "string");
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The main agent's visible trace on the card; `ago` is null when it is older than a week. */
export function claudeTouchLine(ago: string | null): string {
  return ago === null
    ? "Claude hasn't updated these cards this week."
    : `Claude last updated this product's cards ${ago}.`;
}
