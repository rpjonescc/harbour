// The words in the tower's "What's happening" feed and "Wins this week" (spec §4.7, §4.8).
// Jobs are worded by jobWords (lib/explain/job-words.ts) and card moves by movedTodayLine
// (lib/explain/board.ts).

import { sentenceCase } from "./job-words";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const FEED_SENTENCE = {
  /** Under the "Running now" heading, so the sentence is just what it is doing. */
  running: (doing: string) => `${sentenceCase(doing)}.`,
  waiting: (doing: string) => `Waiting to start ${doing}.`,
  done: (done: string) => `${sentenceCase(done)}.`,
  failed: (doing: string) => `Didn't finish ${doing}.`,
  /** Technical details for a job row: the Agents page's name for it and its kind. */
  technical: (label: string, kind: string) => `${label} (${kind})`,
  rise: (productName: string, areaName: string, by: number) =>
    `${productName}: ${areaName} up ${by}.`,
} as const;

export const WIN_LINE = {
  cardsFinished: (count: number, withPr: number) => {
    const cards = `${count} ${plural(count, "card", "cards")} finished this week`;
    if (withPr === 0) return `${cards}.`;
    return `${cards}, ${withPr} with a pull request merged.`;
  },
  /** A rise that stayed in one verdict band. */
  upBy: (productName: string, areaName: string, by: number) =>
    `${productName}: ${areaName} up ${by}.`,
  /** A rise that crossed into a better verdict band. */
  wentFrom: (productName: string, areaName: string, from: string, to: string) =>
    `${productName}: ${areaName} went from ${from} to ${to}.`,
  newlyInGoogle: (productName: string, gain: number) =>
    `${productName}: ${gain} more ${plural(gain, "page", "pages")} in Google.`,
  approved: (count: number) =>
    `${count} content ${plural(count, "piece", "pieces")} approved this week.`,
} as const;
