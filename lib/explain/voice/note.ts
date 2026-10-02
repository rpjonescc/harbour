import { z } from "zod";
import { INVISIBLE_CHARS } from "@/lib/text/hidden-chars";
import { FACT_CAPS } from "./facts";

/** Hard caps (spec §3.4). The prompt asks for ASKED_BODY_CHARS: a few over never costs a retry. */
export const NOTE_LIMITS = {
  greeting: 60,
  headline: 110,
  body: 360,
  rest: 160,
  pick: FACT_CAPS.text,
  picks: 3,
} as const;
export const ASKED_BODY_CHARS = 330;
export const MOODS = ["celebrate", "steady", "attention"] as const;

const MARKUP =
  /[<>`*_#[\]{}\\|]|https?:|www\.|:\/\/|javascript\s*:|\S+@\S+\.\S+|\b[a-z0-9-]+\.(?:ai|xyz|me|tv|io|co|uk|app|dev|com|net|org|au|nz|us|ca|de|fr|info|biz|site|online|store|tech|page|link)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
// Control characters and everything invisible (see lib/text/hidden-chars.ts): they can hide or reorder text.
const INVISIBLE = new RegExp(`\\p{Cc}|${INVISIBLE_CHARS.source}`, "u");
// Digits that are not 0-9 (full-width, Arabic-Indic...) and number-like symbols (superscripts,
// fractions, Roman numerals) would slip past the "every figure is in the facts" check.
const FOREIGN_NUMBER = /(?![0-9])\p{Nd}|[\p{No}\p{Nl}]/u;

/** Plain text on one line: no markdown, HTML, links, code, emoji, hidden characters or odd digits. */
export function isPlainText(text: string): boolean {
  return ![MARKUP, EMOJI, INVISIBLE, FOREIGN_NUMBER].some((pattern) => pattern.test(text));
}

const PLAIN = "must be plain text on one line: no markup, links, emoji or hidden characters";
const text = (max: number) =>
  z.string().trim().min(1).max(max).refine(isPlainText, { message: PLAIN });

/** The note's fields (spec §3.1). The agent's file is parsed into this at the boundary. */
export const noteSchema = z.strictObject({
  greeting: text(NOTE_LIMITS.greeting),
  headline: text(NOTE_LIMITS.headline),
  body: text(NOTE_LIMITS.body),
  // Picks are checked by exact membership in the board's titles, which may hold markup characters.
  picks: z.array(z.string().trim().min(1).max(NOTE_LIMITS.pick)).max(NOTE_LIMITS.picks).default([]),
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
