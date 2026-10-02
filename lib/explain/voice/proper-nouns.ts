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
  "Actions",
  "Today",
  "Agents",
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

// Words that may start a sentence without being in the facts.
const OPENERS = new Set([
  "Good",
  "Morning",
  "Afternoon",
  "Evening",
  "Nothing",
  "Everything",
  "One",
  "Two",
  "That",
  "This",
  "It",
  "Your",
  "You",
  "The",
  "A",
  "And",
  "But",
  "So",
  "Now",
  "Here",
  "Let",
  "All",
  "Rest",
  "Lately",
  "Also",
  "No",
  "Not",
  "Next",
  "Once",
  "When",
  "If",
  "Still",
  "Then",
  "There",
  "Take",
  "Quiet",
  "Calm",
]);

const strip = (raw: string) => raw.replace(/^\p{P}+|\p{P}+$/gu, "").replace(/['’]s$/u, "");
const wordsOf = (text: string) => text.split(/\s+/).map(strip).filter(Boolean);
const capitalised = (word: string) => /^\p{Lu}/u.test(word);

type Known = { phrases: string[][]; words: Set<string> };

/**
 * Product names and the owner's name count only as whole phrases, so "Lighthouse Docs" (a mix of
 * two products) is flagged; other words in the facts count one by one.
 */
function knownOf(facts: Facts): Known {
  const names = [...facts.products.map((p) => p.name), facts.ownerFirstName ?? ""].filter(Boolean);
  const strangers = (text: string) =>
    names.reduce((rest, name) => rest.split(name).join(" "), text);
  const looseText = [
    ...AREA_ORDER.map((key) => AREAS[key].name),
    ...facts.actions.map((a) => a.title),
    ...facts.wins.map(strangers),
    ...facts.trouble.map(strangers),
  ];
  return {
    phrases: names.map(wordsOf).sort((a, b) => b.length - a.length),
    words: new Set([...ALLOWED, ...looseText.flatMap(wordsOf)]),
  };
}

const startsWith = (tokens: string[], at: number, phrase: string[]) =>
  phrase.length > 0 && phrase.every((word, i) => tokens[at + i] === word);

function unknownIn(sentence: string, known: Known): string | null {
  const tokens = wordsOf(sentence);
  for (let i = 0; i < tokens.length; i++) {
    const phrase = known.phrases.find((p) => startsWith(tokens, i, p));
    if (phrase) {
      i += phrase.length - 1;
      continue;
    }
    const word = tokens[i] ?? "";
    if (!capitalised(word) || known.words.has(word) || (i === 0 && OPENERS.has(word))) continue;
    return word;
  }
  return null;
}

/**
 * The first capitalised word (a sentence's first word included) that is not in the facts, nor an
 * everyday opener: a product, person or place the agent made up; else null.
 */
export function unknownProperNoun(parts: readonly string[], facts: Facts): string | null {
  const known = knownOf(facts);
  for (const part of parts) {
    for (const sentence of part.split(/(?<=[.!?])\s+/)) {
      const stranger = unknownIn(sentence, known);
      if (stranger !== null) return stranger;
    }
  }
  return null;
}
