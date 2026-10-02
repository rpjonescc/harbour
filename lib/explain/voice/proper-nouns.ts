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

// Everyday words that start a sentence; one of these next to a name does not hide the name.
const OPENERS = new Set([
  "Good",
  "Morning",
  "Afternoon",
  "Evening",
  "Hi",
  "Hello",
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
  "No",
  "Not",
  "Yesterday",
  "Overnight",
  "Tonight",
]);
const QUOTED = /[«‹„“「『"]([^«»‹›„“”「」『』"]{1,60})[»›“”」』"]/gu;

const strip = (raw: string) => raw.replace(/^\p{P}+|\p{P}+$/gu, "");
const wordOf = (raw: string) => strip(raw).replace(/['’]s$/u, "");
const wordsOf = (text: string) => text.split(/\s+/).map(wordOf).filter(Boolean);
const capitalised = (word: string) => /^\p{Lu}/u.test(word);
const possessive = (raw: string) => /['’]s\p{P}*$/u.test(raw);

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

/** True when the capitalised word at `at` is a known word or the start of a known name. */
function isKnown(tokens: string[], at: number, known: Known): boolean {
  const word = tokens[at] ?? "";
  return known.words.has(word) || known.phrases.some((p) => startsWith(tokens, at, p));
}

/**
 * Known limit: a single invented name used only as the first word of a sentence can pass, since
 * every sentence starts with a capital. It is flagged when it is possessive ("Zenith's"), runs on
 * into another unknown capitalised word ("Zenith Labs"), or sits in quotes.
 */
function openerProblem(raw: string[], tokens: string[], known: Known): string | null {
  const first = tokens[0] ?? "";
  if (!capitalised(first) || isKnown(tokens, 0, known)) return null;
  if (possessive(raw[0] ?? "") && !OPENERS.has(first)) return first;
  // A comma or stop after the first word ends it: "Lately, Zenith..." is not one name.
  if (/\p{P}$/u.test(raw[0] ?? "")) return null;
  const next = tokens[1] ?? "";
  const stranger = capitalised(next) && !isKnown(tokens, 1, known) && !OPENERS.has(next);
  // "The Zenith ...": the name is the unknown word, not the opener before it.
  return stranger ? (OPENERS.has(first) ? next : first) : null;
}

function unknownIn(sentence: string, known: Known): string | null {
  const raw = sentence.split(/\s+/).filter(Boolean);
  const tokens = raw.map(wordOf);
  const opener = openerProblem(raw, tokens, known);
  if (opener !== null) return opener;
  for (let i = 0; i < tokens.length; i++) {
    const phrase = known.phrases.find((p) => startsWith(tokens, i, p));
    if (phrase) {
      i += phrase.length - 1;
      continue;
    }
    const word = tokens[i] ?? "";
    if (i > 0 && capitalised(word) && !known.words.has(word)) return word;
  }
  return null;
}

/** A capitalised word inside quotation marks that is not in the facts: a quoted made-up name. */
function quotedStranger(sentence: string, known: Known): string | null {
  for (const match of sentence.matchAll(QUOTED)) {
    const tokens = wordsOf(match[1] ?? "");
    const at = tokens.findIndex((w, i) => capitalised(w) && !isKnown(tokens, i, known));
    if (at >= 0) return tokens[at] ?? null;
  }
  return null;
}

/**
 * The first capitalised word that is not in the facts (a product, person or place the agent made
 * up), checked mid-sentence and inside quotes; else null.
 */
export function unknownProperNoun(parts: readonly string[], facts: Facts): string | null {
  const known = knownOf(facts);
  for (const part of parts) {
    for (const sentence of part.split(/(?<=[.!?])\s+/)) {
      const stranger = quotedStranger(sentence, known) ?? unknownIn(sentence, known);
      if (stranger !== null) return stranger;
    }
  }
  return null;
}
