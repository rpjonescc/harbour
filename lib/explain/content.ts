/** The Content page's own words for refusals and failures that the owner can act on. */
export const voiceMissingMessage = (productName: string) =>
  `Write ${productName}'s voice profile first. The template is on the Content page.`;

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
  network_error: "Harbour couldn't be reached, so nothing was started. Try again in a moment.",
};
export const REFUSAL_FALLBACK = "Harbour couldn't start that. Try again in a moment.";

/** The sentence for a failed content request: the server's own words first, else ours. */
export function refusalMessage(error: string, message?: string): string {
  return message ?? REFUSAL_MESSAGES[error] ?? REFUSAL_FALLBACK;
}
