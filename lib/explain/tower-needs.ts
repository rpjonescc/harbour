// The tower's "Needs you" items: one plain sentence and one button each (spec §4.4).

const n = (count: number, one: string, many: string) => (count === 1 ? one : many);

export const NEED_BUTTON = {
  fix: "How to fix",
  review: "Review",
  decide: "Decide",
  open: "Open",
  run: "See what happened",
} as const;

export const NEED_SENTENCE = {
  review: (count: number) =>
    `${count} ${n(count, "card on the Board is", "cards on the Board are")} waiting for you.`,
  ideas: (count: number) => `${count} new ${n(count, "idea", "ideas")} to decide.`,
  contentNeedsYou: (count: number) =>
    `${count} ${n(count, "draft needs", "drafts need")} you before ${n(count, "it", "they")} can go out.`,
  contentReady: (count: number) => `${count} ${n(count, "draft is", "drafts are")} ready for you.`,
  approvals: (count: number, productName: string) =>
    `${count} research ${n(count, "target", "targets")} for ${productName} ${n(count, "is", "are")} waiting for your OK.`,
  /** `doing` from jobWords: "finding ideas for Acme Blog". */
  run: (doing: string) => `Didn't finish ${doing}.`,
} as const;

/** The button's accessible name: its label, then what it is for ("Review: …"). */
export const needButtonName = (label: string, sentence: string) =>
  `${label}: ${sentence.replace(/\.$/, "")}`;
