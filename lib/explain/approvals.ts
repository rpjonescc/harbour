/** "3 research targets waiting for your OK": shared by Settings and the Actions board's note. */
export function approvalsPhrase(count: number): string {
  return `${count} research ${count === 1 ? "target" : "targets"} waiting for your OK`;
}

/** Said when approving would pass six content pillars: what happened, why, what to do. */
export const PILLAR_LIMIT_MESSAGE =
  "You already have six approved content pillars, which is the most Harbour keeps. Reject one you no longer want, then approve this one.";

export const PILLAR_LIMIT_ALL_MESSAGE =
  "Approving all of these would take you past six content pillars, which is the most Harbour keeps. Approve the ones you want one at a time, or reject some first.";

/** The plain reason for a failed approval request, or the caller's generic line. */
export function approvalFailure(code: string, fallback: string): string {
  if (code === "pillar_limit") return PILLAR_LIMIT_MESSAGE;
  if (code === "pillar_limit_all") return PILLAR_LIMIT_ALL_MESSAGE;
  return fallback;
}

/** Stored proposal status → the words on screen. */
const STATUS_WORDS = {
  proposed: "Waiting for your OK",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export function proposalStatusLabel(status: string): string {
  return status in STATUS_WORDS ? STATUS_WORDS[status as keyof typeof STATUS_WORDS] : status;
}

/** Stored keyword intent → what the searcher is after, in plain words. */
const INTENT_WORDS: Record<string, string> = {
  informational: "wants to learn",
  commercial: "comparing options",
  transactional: "ready to buy",
  navigational: "looking for you",
  local: "looking nearby",
};

export function intentLabel(intent: string): string {
  return INTENT_WORDS[intent] ?? intent;
}

const TYPE_PLURALS: Record<string, string> = {
  keyword: "keywords",
  question: "questions",
  competitor: "competitors",
  pillar: "content pillars",
};

/** "keywords", "content pillars": the plural a person reads for a proposal type. */
export function proposalTypePlural(type: string): string {
  return TYPE_PLURALS[type] ?? `${type}s`;
}

/** Said under an empty proposal list: why it is empty and what to do. */
export function emptyProposalsMessage(productName: string): string {
  return `Nothing to approve for ${productName} yet. Harbour fills this list when it finds ideas.`;
}

const FIELD_WORDS: Record<string, string> = {
  term: "The search phrase",
  intent: "What the searcher wants",
  location: "The location",
  text: "The question",
  name: "The name",
  url: "The web address",
  key: "The short code",
  description: "The description",
};

const EDIT_FALLBACK = "That change couldn't be saved. Check the fields and try again.";

function editIssue(line: string): string {
  if (/^rejected items/.test(line)) {
    return "This one was rejected, so it can't be changed. Approve it first if you want to edit it.";
  }
  if (/already exists/.test(line)) {
    return "You already have an item with that value. Change it, or keep the one you have.";
  }
  const [field = "", ...rest] = line.split(": ");
  const word = FIELD_WORDS[field];
  const reason = rest.join(": ");
  if (!word) return EDIT_FALLBACK;
  if (/can't change/.test(reason)) {
    return `${word} can't change once the pillar is approved. Put the original back to save your other edits.`;
  }
  if (/too small|empty/i.test(reason)) return `${word} can't be empty. Fill it in.`;
  if (/too big|too long/i.test(reason)) return `${word} is too long. Shorten it.`;
  if (/url|credentials/i.test(reason)) {
    return `${word} must start with http:// or https:// and have no username or password in it.`;
  }
  if (/plain text/i.test(reason)) return `${word} must be plain text on one line.`;
  return `${word} isn't in a form Harbour accepts. Check it and try again.`;
}

/** Turns the saved-edit check's raw lines ("term: Too small") into plain sentences. */
export function editFailureMessage(raw: string): string {
  const lines = [...new Set(raw.split("\n").map(editIssue))];
  return lines.join("\n");
}
