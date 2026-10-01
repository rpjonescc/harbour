import type { HTMLElement } from "node-html-parser";

/** Question-style headings on a page, and how many a short paragraph answers right below. */
export type QuestionFacts = {
  /** Visible h1–h6 headings phrased as a reader's question (see `isQuestion`). */
  questionHeadings: number;
  /** Those whose next element is a paragraph of 1–60 words: an answer engines can lift. */
  conciseAnswers: number;
};

/** Answer engines quote short answers; 60 words is the common featured-snippet guidance. */
const MAX_ANSWER_WORDS = 60;
/**
 * A question word followed by an auxiliary or a quantity ("How do…", "What is…", "How much…"):
 * a bare question word opens plenty of labels too ("How it works", "Who we are").
 */
const QUESTION_START =
  /^(how|what|why|when|where|who|which|can|do|does|is|are|should|will)\s+(do|does|did|is|are|was|were|can|could|should|will|would|to|much|many|long|often)\b/i;
/** A yes/no question without its "?" ("Can I self-host it", "Does it work offline"). */
const YES_NO_START =
  /^(can|do|does|is|are|should|will)\s+(i|you|it|they|there|my|your|this|the)\b/i;
/** "Why choose us?" and "What we do" are about the business, not a reader's question. */
const FIRST_PERSON = /\b(we|us|our)\b/i;
const HIDDEN = "script, style, noscript, template";

const wordsIn = (text: string) => text.split(/\s+/).filter((word) => word.length > 0).length;

/**
 * A heading ending in "?" or opening like a question ("How do I…", "What is…", "How much…",
 * "Can I…"),
 * unless it speaks in the first person plural.
 */
export function isQuestion(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (FIRST_PERSON.test(value)) return false;
  return value.endsWith("?") || QUESTION_START.test(value) || YES_NO_START.test(value);
}

function answersConcisely(heading: HTMLElement): boolean {
  const next = heading.nextElementSibling;
  if (next?.tagName !== "P") return false;
  const words = wordsIn(next.text);
  return words > 0 && words <= MAX_ANSWER_WORDS;
}

/** Counts question headings and concise answers in visible content. */
export function questionFacts(root: HTMLElement): QuestionFacts {
  const headings = root
    .querySelectorAll("h1, h2, h3, h4, h5, h6")
    .filter((heading) => !heading.closest(HIDDEN) && isQuestion(heading.text));
  return {
    questionHeadings: headings.length,
    conciseAnswers: headings.filter(answersConcisely).length,
  };
}
