/** Said when the server reports the Second Brain folder missing or unreadable (HTTP 409). */
export const BRAIN_SEARCH_UNAVAILABLE =
  "Search can't reach the Second Brain right now, so no notes were looked at. Your notes are safe. Check that the Second Brain folder is connected, then search again.";

/** Said when a search breaks for any other reason (network, server error, odd reply). */
export const BRAIN_SEARCH_FAILED =
  "That search didn't work this time. Nothing is lost. Try again in a moment.";

/** Said when a search worked and found nothing. */
export const BRAIN_SEARCH_EMPTY = "No notes match that. Try fewer or different words.";

/** The plain message for a failed search: what happened, whether it matters, what to do. */
export function brainSearchFailure(unavailable: boolean): string {
  return unavailable ? BRAIN_SEARCH_UNAVAILABLE : BRAIN_SEARCH_FAILED;
}
