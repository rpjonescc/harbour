import type { SyncFailureKind, SyncHeldReason } from "@/lib/actions/pr-sync/types";

/**
 * The notes `pnpm actions sync-prs` leaves on a card. They are also how the sync remembers what it
 * already recorded (see `readSyncHistory`), so changing one makes the next run record it again
 * once.
 */
export const PR_SYNC_NOTE = {
  open: "The pull request is open and waiting for a review.",
  draft: "A draft pull request is open, so the work has started.",
  closed: "Pull request closed without merging; the card needs a decision.",
  checksFailing: "Checks are failing on the pull request.",
  checksPassing: "Checks are passing again.",
} as const;

/** Every merged note starts with this, whatever the date. */
export const MERGED_NOTE_START = "Pull request merged";

/** "Pull request merged on 3 October 2026." (in the owner's time zone and locale). */
export function mergedNote(mergedAt: Date | null, timeZone: string, locale: string): string {
  if (mergedAt === null) return `${MERGED_NOTE_START}.`;
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(mergedAt);
  return `${MERGED_NOTE_START} on ${day}.`;
}

/** Why a card could not be checked, and what to do about it. */
export const SYNC_FAILURE: Readonly<Record<SyncFailureKind, string>> = {
  gh_missing:
    "The GitHub command-line tool (gh) is not installed or not on the PATH. Install it, then run gh auth login.",
  not_logged_in:
    "The GitHub command-line tool is not logged in. Run gh auth login on this machine.",
  rate_limited: "GitHub's rate limit was reached. The next run will try again.",
  not_found:
    "GitHub could not find this pull request, or this login cannot see it. Check the link on the card.",
  timed_out: "GitHub did not answer within 20 seconds. The next run will try again.",
  failed: "The GitHub command-line tool failed.",
  unreadable: "GitHub's answer could not be read.",
  bad_link: "The card's pull request link is not a GitHub pull request address.",
  out_of_time: "Not checked: this run reached its time limit. The next run will try again.",
  moved_meanwhile: "The card moved while it was being checked. The next run will look again.",
  refused: "The board refused the move.",
};

/** Why a card was left as it is although its pull request says otherwise. */
export const SYNC_HELD: Readonly<Record<SyncHeldReason, string>> = {
  new_idea: "It is a new idea. Accept it on the board first: the sync never accepts ideas.",
  moved_by_hand:
    "The sync already recorded this, and the card was moved since. It is left where it is for a decision.",
};
