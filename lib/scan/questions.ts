import type { HTMLElement } from "node-html-parser";

/** Question-style headings on a page, and how many a short paragraph answers right below. */
export type QuestionFacts = {
  /** h1–h6 headings phrased as a question (see `isQuestion`). */
  questionHeadings: number;
  /** Those whose next element is a paragraph of 1–60 words: an answer engines can lift. */
  conciseAnswers: number;
};

/** Answer engines quote short answers; 60 words is the common featured-snippet guidance. */
const MAX_ANSWER_WORDS = 60;
const QUESTION_START =
  /^(what|how|why|when|where|who|which|can|could|does|do|did|is|are|should|will|would)\b/i;
const HIDDEN = "script, style, noscript, template";

const wordsIn = (text: string) => text.split(/\s+/).filter((word) => word.length > 0).length;

/** A heading ending in "?" or opening with a question word ("How do I…", "What is…"). */
export function isQuestion(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  return value.endsWith("?") || QUESTION_START.test(value);
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
