import { AREA_ORDER, AREAS } from "../areas";
import { type Facts, figuresOf, numbersIn } from "./facts";
import { type Note, safeReason } from "./note";
import { unknownProperNoun } from "./proper-nouns";

/** Words that pressure the owner (spec §3.4). Also printed in the persona prompt. */
export const BANNED_WORDS = [
  "hurry",
  "urgent",
  "behind",
  "overdue",
  "falling behind",
  "failing",
  "must",
  "should have",
] as const;

/** An explicit next step, for a note that names trouble but picks nothing. */
export const NEXT_STEP_PHRASES = [
  "next step",
  "start with",
  "worth a look",
  "a good place to start",
  "one thing to do",
] as const;

type Context = { note: Note; facts: Facts; parts: string[]; text: string };
type Rule = (context: Context) => string | null;

const NUMBER_WORDS = new Map<string, number>([
  ...[
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ].map((word, i) => [word, i + 2] as const),
  ...["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"].map(
    (word, i) => [word, (i + 2) * 10] as const,
  ),
  ["hundred", 100],
  ["thousand", 1000],
  ["dozen", 12],
]);
// Quantities with no set value can never be checked against the facts: any of them is rejected
// unless the facts' own text uses the same word.
// Ordinals from third up are rankings ("now third on Google"); first and second are everyday words.
const ORDINAL =
  "thi?rd|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|(?:thir|four|fif|six|seven|eigh|nine)teenth|(?:twen|thir|for|fif|six|seven|eigh|nine)tieth|hundredth|thousandth";
const VAGUE_QUANTITY = new RegExp(
  `^(?:half|halved|doubl(?:e|ed)|tripl(?:e|ed)|(?:hundred|thousand|million|billion|dozen)s|millions?|billions?|twice|thrice|quarter|\\w+fold|${ORDINAL})$`,
);
const DIGIT_ORDINAL = /\b\d+(?:st|nd|rd|th)\b/gi;
const RANKING = /\bnumber (?:one|1)\b/i;
// Only these exact reassurances are honest about trouble; they are removed before the check, so
// "no doubt the backup failed" and "no surprise the site is down" are still caught.
const REASSURANCE =
  /\b(?:nothing (?:is broken|broke|failed|has failed|went wrong|is down|is missing)|no (?:trouble|errors|problems|outage))\b|\bmissing (?:data|scores?)\b/gi;
// "down" is trouble only in these phrases: "down 2" or "down a little" is just a score moving.
const DOWN =
  "(?:is|are|went|gone|goes|stays|was) down(?!\\s+(?:\\d|a\\s|by\\b|slightly|just|from|to\\b))|site down";
const TROUBLE = new RegExp(
  `\\b(?:broken|broke|not working|went wrong|problems?|trouble|didn't finish|did not finish|failed|failing|outage|crashed|stalled|timed out|offline|errors?|unreachable|missing|${DOWN})\\b`,
  "gi",
);
const PRAISE = /\b(?:strong|excellent|thriving|brilliant|flying|crushing|nailed)\b/i;
// Stems, so "hurried", "urgently" and "mustn't" are caught like their root.
const BANNED_PATTERNS: Record<(typeof BANNED_WORDS)[number], string> = {
  hurry: "hurr(?:y|ied|ying)",
  urgent: "urgent(?:ly)?",
  behind: "behind",
  overdue: "overdue",
  "falling behind": "falling behind",
  failing: "failing",
  must: "must(?:n['’]t)?",
  "should have": "should have",
};

const has = (text: string, phrase: string) => new RegExp(`\\b${phrase}\\b`, "i").test(text);
const factsText = (facts: Facts) =>
  [
    ...facts.products.map((p) => p.name),
    ...facts.actions.map((a) => a.title),
    ...facts.wins,
    ...facts.trouble,
  ].join(" ");

/** Capitalised words the facts themselves use (HTTPS, a product name): not shouting. */
function capsIn(text: string): Set<string> {
  return new Set(text.match(/\b[A-Z]{4,}\b/g) ?? []);
}

/** A word that mixes Latin letters with Cyrillic or Greek ones: a look-alike spelling trick. */
const mixedScript = (text: string) =>
  text
    .split(/\s+/)
    .some(
      (word) =>
        /\p{Script=Latin}/u.test(word) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word),
    );

/** The first tone problem in `text` (exclamation runs, shouting, banned words), else null. */
export function toneProblem(
  text: string,
  allowedCaps: ReadonlySet<string> = new Set(),
): string | null {
  if (/!{2,}/.test(text)) {
    return "The note has a run of exclamation marks. Keep it calm: one at most, usually none.";
  }
  if ((text.match(/\b[A-Z]{4,}\b/g) ?? []).some((word) => !allowedCaps.has(word))) {
    return "The note shouts in capitals. Write in normal case.";
  }
  if (mixedScript(text))
    return "The note mixes alphabets inside one word. Use plain Latin letters.";
  // Marks and blank braille cells inside a word ("hu\u0301rry") must not hide it from the stems.
  const bare = text.normalize("NFD").replace(/[\p{M}\u2800]/gu, "");
  const banned = BANNED_WORDS.find((word) => has(bare, BANNED_PATTERNS[word]));
  return banned ? `The note uses "${banned}", which is banned. Say it more gently.` : null;
}

const codes: Rule = ({ text }) =>
  /\b(?:SEO|GEO|AEO)\b/i.test(text)
    ? "The note uses an area code (SEO, GEO or AEO). Use the plain area names from the facts."
    : null;

const tone: Rule = ({ text, facts }) => toneProblem(text, capsIn(factsText(facts)));

const figures: Rule = ({ text, facts }) => {
  const known = figuresOf(facts);
  const stray = numbersIn(text).find((n) => !known.has(n));
  if (stray !== undefined) {
    return `The note uses the figure ${stray}, which is not in the facts. Use only figures from the facts, or say it in words.`;
  }
  const ownText = factsText(facts).toLowerCase();
  const own = new Set(ownText.match(/[a-z]+/g));
  const invented = (word: string) => {
    const value = NUMBER_WORDS.get(word);
    return value !== undefined ? !known.has(value) : VAGUE_QUANTITY.test(word);
  };
  const word = (text.toLowerCase().match(/[a-z]+/g) ?? []).find((w) => invented(w) && !own.has(w));
  if (word !== undefined) {
    return `The note says "${word}", a figure that is not in the facts. Use only figures from the facts.`;
  }
  const rank = text.match(DIGIT_ORDINAL)?.find((o) => !ownText.includes(o.toLowerCase()));
  if (rank !== undefined) {
    return `The note says "${rank}", a ranking that is not in the facts. Leave out rankings.`;
  }
  return RANKING.test(text)
    ? "The note says it is number one, which is not in the facts. Leave out rankings."
    : null;
};

const names: Rule = ({ parts, facts }) => {
  const scored = new Set(facts.products.flatMap((p) => p.areas.map((a) => a.name)));
  for (const key of AREA_ORDER) {
    const name = AREAS[key].name;
    const named = parts.some((part) => part.toLowerCase().includes(name.toLowerCase()));
    if (named && !scored.has(name)) {
      return `The note names "${name}", but the facts have no score for it. Leave it out.`;
    }
  }
  const stranger = unknownProperNoun(parts, facts);
  return stranger === null
    ? null
    : `The note names "${safeReason(stranger)}", which is not in the facts. Name only the products, areas and people in the facts.`;
};

const picks: Rule = ({ note, facts }) => {
  const titles = new Set(facts.actions.map((a) => a.title));
  if (note.picks.some((pick) => !titles.has(pick))) {
    return "A pick is not the exact title of an action on the board. Copy titles exactly from the facts, or leave picks empty.";
  }
  return new Set(note.picks).size < note.picks.length ? "The same pick is listed twice." : null;
};

const rest: Rule = ({ note, facts }) => {
  if (facts.rest !== null && note.rest === undefined) {
    const when = facts.rest === "weekend" ? "the weekend" : "out of hours";
    return `The facts say it is ${when}. Add a rest sentence saying what can wait.`;
  }
  if (facts.rest === null && note.rest !== undefined) {
    return "Leave the rest sentence out: it is not the weekend or out of hours.";
  }
  return null;
};

/** A trouble word in `text` that the facts' own words do not use, after honest reassurance. */
function inventedTrouble(text: string, facts: Facts): boolean {
  const own = factsText(facts).toLowerCase();
  const claims = text.replace(REASSURANCE, " ").match(TROUBLE) ?? [];
  return claims.some((claim) => !own.includes(claim.toLowerCase()));
}

const trouble: Rule = ({ note, facts, text }) => {
  if (facts.trouble.length === 0) {
    return inventedTrouble(text, facts)
      ? "The note talks about trouble, but the facts list none. Do not claim anything is broken."
      : null;
  }
  const stepped = note.picks.length > 0 || NEXT_STEP_PHRASES.some((phrase) => has(text, phrase));
  return stepped
    ? null
    : `The facts list trouble, so the note needs a next step: name an action in picks, or use a phrase like "${NEXT_STEP_PHRASES[0]}" or "${NEXT_STEP_PHRASES[1]}".`;
};

const honesty: Rule = ({ note, facts, text }) => {
  if (note.mood === "celebrate" && facts.wins.length === 0) {
    return "The note celebrates, but the facts list no wins. Use mood steady or attention.";
  }
  const anyGood = facts.products.some((p) => p.areas.some((a) => a.score >= 70));
  return !anyGood && PRAISE.test(text)
    ? "The note praises scores that are not strong. Be kind and honest about where they stand."
    : null;
};

const RULES: readonly Rule[] = [codes, tone, figures, names, picks, rest, trouble, honesty];

/**
 * Checks an agent's note against the facts it was given (spec §3.4): no invented figures or
 * names, picks from the board, no pressure, a next step for trouble, a rest sentence exactly when
 * it is rest time. Returns null when accepted, else the first reason, worded for the agent.
 */
export function checkNote(note: Note, facts: Facts): string | null {
  const parts = [note.greeting, note.headline, note.body, ...(note.rest ? [note.rest] : [])];
  const context = { note, facts, parts, text: parts.join(" ") };
  for (const rule of RULES) {
    const reason = rule(context);
    if (reason !== null) return reason;
  }
  return null;
}
