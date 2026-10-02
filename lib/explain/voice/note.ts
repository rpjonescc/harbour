import { z } from "zod";

/** Hard caps (spec §3.4). The prompt asks for ASKED_BODY_CHARS: a few over never costs a retry. */
export const NOTE_LIMITS = {
  greeting: 60,
  headline: 110,
  body: 360,
  rest: 160,
  pick: 120,
  picks: 3,
} as const;
export const ASKED_BODY_CHARS = 330;
export const MOODS = ["celebrate", "steady", "attention"] as const;

const MARKUP = /[<>`*_#[\]{}\\|]|https?:|www\.|:\/\//i;
const EMOJI = /\p{Extended_Pictographic}/u;

/** Control, zero-width and bidirectional formatting characters: they can hide or reorder text. */
function isInvisible(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/** Plain text on one line: no markdown, HTML, links, code, emoji or hidden characters. */
export function isPlainText(text: string): boolean {
  if (MARKUP.test(text) || EMOJI.test(text)) return false;
  return ![...text].some((char) => isInvisible(char.codePointAt(0) ?? 0));
}

const PLAIN = "must be plain text on one line: no markup, links, emoji or hidden characters";
const text = (max: number) =>
  z.string().trim().min(1).max(max).refine(isPlainText, { message: PLAIN });

/** The note's fields (spec §3.1). The agent's file is parsed into this at the boundary. */
export const noteSchema = z.strictObject({
  greeting: text(NOTE_LIMITS.greeting),
  headline: text(NOTE_LIMITS.headline),
  body: text(NOTE_LIMITS.body),
  picks: z.array(text(NOTE_LIMITS.pick)).max(NOTE_LIMITS.picks).default([]),
  rest: text(NOTE_LIMITS.rest).optional(),
  mood: z.enum(MOODS),
});

export type Note = z.infer<typeof noteSchema>;

/**
 * A token from the agent's own output, cut to letters, digits and spaces before it goes into a
 * reason that is fed back to the agent: a hostile note cannot write its own retry prompt.
 */
export function safeReason(token: string): string {
  return token.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 40);
}
