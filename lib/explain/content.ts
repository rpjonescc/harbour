/** The Content page's own words for refusals and failures that the owner can act on. */
export const voiceMissingMessage = (productName: string) =>
  `Write ${productName}'s voice profile first. The template is on the Content page.`;

/** A content product's notes file is hand-written; the id is a validated slug, never a raw path. */
export const notesMissingMessage = (productName: string, productId: string) =>
  `Harbour needs a short notes file for ${productName} before it can suggest ideas. Add products/${productId}/notes.md to your Second Brain (a few lines about what it is and who it is for).`;

export const voiceInvalidMessage = (productName: string, reason: string) =>
  `${productName}'s voice profile can't be used: ${reason}`;

/** What a file that the owner already has in the way of a new idea means for the owner. */
export const IDEA_FILE_IN_THE_WAY =
  "A file with the same name as a new idea already exists, so Harbour saved nothing. Rename or remove that file, then try again.";

/** Plain sentences for refusals that carry no message of their own (what happened, what to do). */
export const REFUSAL_MESSAGES: Record<string, string> = {
  token_missing:
    "Harbour isn't connected to Claude yet, so it can't write. Connect it as Settings describes, then try again.",
  screenpipe_missing:
    "Harbour has no Screenpipe key, so it can't read yesterday's activity. Add the key in Settings. Ideas still come from your notes.",
  rate_limited: "You've asked for this a few times today. It's open again tomorrow.",
  content_off: "Content is switched off, so nothing was started.",
  not_found: "Harbour couldn't find that. Refresh the page and try again.",
  not_an_idea: "That idea is already being written. Refresh the page to see it.",
  nothing_to_retry: "There is nothing to try again. Refresh the page to see where it is.",
  too_large: "That is too much text to send at once. Shorten it and try again.",
  network_error: "Harbour couldn't be reached, so nothing was started. Try again in a moment.",
};
export const REFUSAL_FALLBACK = "Harbour couldn't start that. Try again in a moment.";

/** The sentence for a failed content request: the server's own words first, else ours. */
export function refusalMessage(error: string, message?: string): string {
  return message ?? REFUSAL_MESSAGES[error] ?? REFUSAL_FALLBACK;
}

/** What a cut-short list says, naming the cap that cut it. */
export const CAP_NOTES = {
  ideas: "Showing the newest 200 ideas. Older ones are still in your Second Brain.",
  pieces: "Showing the newest 600 pieces. Older ones are still in your Second Brain.",
} as const;

/** A content folder Harbour could not read: what happened, whether it matters, what to do. */
export const FOLDER_ERROR =
  "Harbour couldn't read the content folder in your Second Brain, so some ideas and drafts may be missing from this page. Nothing was lost. Check that the folder can be read, then reload.";

/** The words for each flag in "Check before posting" and at approval (never the raw key). */
export const FLAG_WORDS = {
  health: "health",
  legal: "legal",
  curriculum: "curriculum or education",
  pricing: "pricing",
  testimonial: "testimonial or quote",
  comparative: "comparison",
} as const;

/** The piece line when a stub carries no reason of its own. */
export const STUB_FALLBACK =
  "This piece wasn't written. Discard it; the idea's other pieces are unaffected.";

/** What an empty tab will show, when, and why it is empty now (plain words, no codes). */
export const EMPTY_TABS: Record<
  "ready" | "needs-you" | "ideas" | "writing" | "approved" | "discarded",
  { what: string; when: string; why: string }
> = {
  ready: {
    what: "Drafts that passed every check will appear here.",
    when: "After you pick an idea and Harbour finishes writing it.",
    why: "Nothing is ready for you yet.",
  },
  "needs-you": {
    what: "Drafts that need a look from you will appear here, with what to do.",
    when: "When a check finds something or a step doesn't finish.",
    why: "Nothing needs you right now.",
  },
  ideas: {
    what: "Ideas will appear here.",
    when: "On Monday mornings, or when you ask for some.",
    why: "There are none waiting yet.",
  },
  writing: {
    what: "Ideas being written will appear here.",
    when: "From the moment you pick one until its drafts are checked.",
    why: "Nothing is being written right now.",
  },
  approved: {
    what: "Pieces you approve will appear here, ready to copy and post yourself.",
    when: "Once you approve a draft.",
    why: "You haven't approved anything yet.",
  },
  discarded: {
    what: "Ideas and pieces you discard will appear here.",
    when: "Once you discard one.",
    why: "You haven't discarded anything.",
  },
};
