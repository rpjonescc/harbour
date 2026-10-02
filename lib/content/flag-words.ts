import { FLAGS, type Flag } from "./schema";

// A keyword net for the flags the agent missed. It is deliberately wide: a flag only asks the
// owner to look (and tick it) before approving; it never fails a gate.
const PATTERNS: Record<Flag, RegExp> = {
  pricing:
    /[$€£¥]|\b(?:prices?|pricing|per (?:month|year|seat)|discounts?|refunds?|subscription|free plan)\b/i,
  health:
    /\b(?:doctors?|symptoms?|diagnos\w*|medical|clinic|therapy|treatment|cure[sd]?|disease|medication)\b/i,
  legal: /\b(?:legal|lawsuit|gdpr|compliance|contracts?|liabilit\w*|copyright|trademark)\b/i,
  curriculum: /\b(?:curriculum|syllabus|year\s+\d+|grade\s+\d+|learning outcomes?|a-levels?)\b/i,
  testimonial:
    /["“][^"”“]{20,}["”]|\b(?:testimonials?|customers? (?:say|said)|reviews? (?:say|said))\b/i,
  comparative: /\b(?:best|only|fastest|cheapest|better than|number one|leading|unmatched)\b|#1\b/i,
};

/** The flags a text earns on keywords alone, in the spec's order. */
export function flagsInText(text: string): Flag[] {
  return FLAGS.filter((flag) => PATTERNS[flag].test(text));
}
