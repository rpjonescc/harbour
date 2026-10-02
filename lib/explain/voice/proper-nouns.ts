import { AREA_ORDER, AREAS } from "../areas";
import type { Facts } from "./facts";

// Words a note may capitalise without being in the facts.
const ALLOWED = [
  "I",
  "Harbour",
  "Google",
  "Claude",
  "ChatGPT",
  "Gemini",
  "Perplexity",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const strip = (raw: string) =>
  raw.replace(/^[("'“‘]+|[.,;:!?)"'”’]+$/gu, "").replace(/['’]s$/u, "");
const wordsOf = (text: string) => text.split(/\s+/).map(strip).filter(Boolean);

function knownWords(facts: Facts): Set<string> {
  const phrases = [
    ...facts.products.map((p) => p.name),
    ...AREA_ORDER.map((key) => AREAS[key].name),
    ...facts.actions.map((a) => a.title),
    ...facts.wins,
    ...facts.trouble,
    facts.ownerFirstName ?? "",
  ];
  return new Set([...ALLOWED, ...phrases.flatMap(wordsOf)]);
}

/**
 * The first word, capitalised in the middle of a sentence, that is not in the facts (a product,
 * person or place the agent made up); else null. A sentence's first word is skipped: it is
 * capitalised anyway.
 */
export function unknownProperNoun(parts: readonly string[], facts: Facts): string | null {
  const known = knownWords(facts);
  for (const part of parts) {
    for (const sentence of part.split(/(?<=[.!?])\s+/)) {
      for (const word of wordsOf(sentence).slice(1)) {
        if (/^\p{Lu}/u.test(word) && !known.has(word)) return word;
      }
    }
  }
  return null;
}
