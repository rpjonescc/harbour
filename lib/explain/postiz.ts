// The words for "Send to Postiz as a draft" (spec §11): the button, its line, and every reason a
// send stops. Setting names appear only inside the setup steps.

import type { PostizFailure } from "@/lib/content/worker/postiz/client";

/** What Postiz does for Harbour, in one line. */
export const POSTIZ_PURPOSE =
  "Lets Harbour put an approved piece into your own Postiz as a draft. You still post it yourself, from Postiz.";

export const POSTIZ_CONNECT_STEPS: readonly string[] = [
  "In Postiz, connect your social accounts (Postiz calls them channels), then open Settings and create an API key.",
  "Add Postiz's backend address, which ends in /api (for example http://127.0.0.1:4007/api), to .env as HARBOUR_POSTIZ_URL, and the key as HARBOUR_POSTIZ_API_KEY.",
  "In harbour.config.json, under content.postiz.channels, put the Postiz channel id for linkedin, facebook or instagram.",
  "Restart Harbour so both parts pick it up: systemctl --user restart harbour-web harbour-worker.",
];

export const SEND_LABEL = "Send to Postiz as a draft";
export const SEND_LINE =
  "Sends the text only, as a draft. Images aren't sent: add them in Postiz before you post.";
export const SENDING = "Sending to Postiz…";
export const sentLine = (when: string) => `Sent to Postiz as a draft on ${when}.`;
export const RESEND_LABEL = "Send again";
export const resendQuestion = (when: string) =>
  `You sent this to Postiz on ${when}. Send it again as a second draft?`;

/** Why a send stopped before Harbour asked Postiz for anything; the piece is still approved. */
export const POSTIZ_REFUSALS = {
  off: "Content is switched off, so nothing was sent to Postiz.",
  notConnected: "Postiz isn't connected, so nothing was sent. Settings shows how to connect it.",
  notFound: "Harbour couldn't find that piece. Reload the page and try again.",
  notApproved: "Only an approved piece can go to Postiz. Approve it first.",
  notSupported: "Postiz drafts are made for LinkedIn, Facebook and Instagram pieces only.",
  stale: "This piece changed since you opened it. Reload and try again.",
  noChannel: (platform: string) =>
    `No Postiz channel is set for ${platform}, so nothing was sent. Settings shows how to set one.`,
  alreadySent:
    "This piece is already in Postiz as a draft. Choose Send again if you want a second one.",
  rate: "Harbour has sent five drafts to Postiz in the last hour, which is its limit. Try again in an hour.",
  busy: "Harbour is still sending another piece to Postiz. Give it a moment, then try again.",
  unsaved:
    "You have unsaved changes to this piece in your editor, so nothing was sent. Save or undo them, then try again.",
} as const;

/** The channel the owner set isn't one Postiz can use for this platform; nothing was sent. */
export const CHANNEL_PROBLEMS = {
  missing: (platform: string) =>
    `Postiz doesn't have the channel set for ${platform}, so nothing was sent. Check the channel id, or reconnect the account in Postiz.`,
  disabled: (platform: string) =>
    `The ${platform} channel is switched off in Postiz, so nothing was sent. Turn it back on in Postiz, then try again.`,
  wrongKind: (platform: string) =>
    `The channel set for ${platform} is a different kind of account in Postiz, so nothing was sent. Check the channel id.`,
} as const;

const NOTHING_SENT: Readonly<Record<PostizFailure, string>> = {
  unreachable:
    "Harbour couldn't reach Postiz, so nothing was sent. Check that Postiz is running, then try again.",
  "key-refused":
    "Postiz refused Harbour's key, so nothing was sent. Create a new API key in Postiz and put it in Harbour's settings.",
  refused:
    "Postiz turned the draft down, so nothing was sent. Check the account is still connected in Postiz, then try again.",
  "rate-limited":
    "Postiz says Harbour has sent too much this hour, so nothing was sent. Try again in an hour.",
  "server-error":
    "Postiz had a problem of its own, so nothing was sent. Try again in a few minutes.",
  redirected:
    "Postiz tried to send Harbour to another address, so Harbour stopped and sent nothing. Check Postiz's address in Harbour's settings.",
  "too-large": "Postiz's answer was too large to read safely, so nothing was sent.",
  "bad-response": "Postiz's answer wasn't in the shape Harbour expects, so nothing was sent.",
};

/** After the draft was asked for, these failures leave it unknown whether Postiz made one. */
const UNSURE: ReadonlySet<PostizFailure> = new Set([
  "unreachable",
  "server-error",
  "too-large",
  "bad-response",
]);
const UNSURE_SENTENCE =
  "Harbour couldn't tell whether Postiz made the draft. Look in Postiz before you send it again. The piece is still approved.";

/** The plain sentence for a failed Postiz request: before the draft was asked for, or after. */
export function postizFailure(kind: PostizFailure, stage: "channels" | "draft"): string {
  if (stage === "draft" && UNSURE.has(kind)) return UNSURE_SENTENCE;
  return NOTHING_SENT[kind];
}

/** Postiz made the draft but Harbour couldn't record it in the piece. */
export const notRecorded = (postId: string) =>
  `Postiz made the draft (post ${postId}), but Harbour couldn't note it on the piece. Check the brain repository. Sending again would make a second draft.`;
export const NOT_PUSHED =
  "The draft is in Postiz and noted here, but the note couldn't be pushed to the brain repository yet. Harbour will try again.";
export const SEND_CRASHED =
  "Something went wrong while sending to Postiz. Look in Postiz before you send it again. The piece is still approved.";
