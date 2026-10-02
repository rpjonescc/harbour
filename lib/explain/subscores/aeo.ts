import { plural } from "@/lib/scan/scoring/sub-score";
import { numbersIn, type SubScoreExplanation } from "./entry";

function qaCoverage(evidence: string): string | null {
  const found = numbersIn(
    evidence,
    /^(?<marked>\d+) of (?<pages>\d+) HTML pages have FAQPage, HowTo or QAPage markup/,
    ["marked", "pages"],
  );
  return found
    ? `${found.marked} of ${found.pages} pages are marked up as questions and answers.`
    : null;
}

function conciseAnswers(evidence: string): string | null {
  const none = numbersIn(evidence, /^No question-style headings on (?<pages>\d+) HTML pages/, [
    "pages",
  ]);
  if (none) {
    return none.pages === 1
      ? "Your page doesn't ask a question in a heading yet."
      : `None of your ${none.pages} pages ask a question in a heading yet.`;
  }
  const found = numbersIn(
    evidence,
    /^(?<answered>\d+) of (?<questions>\d+) question-style headings are answered/,
    ["answered", "questions"],
  );
  return found
    ? `${found.answered} of ${found.questions} question headings get a short, direct answer straight underneath.`
    : null;
}

function preferredSources(evidence: string): string | null {
  const fresh = numbersIn(evidence, /(?<urls>\d+) URLs? updated in the last 30 days/, ["urls"]);
  if (!fresh) return null;
  const changed = `${fresh.urls} ${plural(fresh.urls, "page")} changed in the last 30 days`;
  if (evidence.startsWith("Preferred Sources button on")) {
    return `There's a Preferred Sources button, and ${changed}.`;
  }
  if (evidence.startsWith("No Preferred Sources button")) {
    return `There's no Preferred Sources button yet, and ${changed}.`;
  }
  return `${changed}.`;
}

/** The AEO sub-scores of the current formula (lib/scan/scoring/aeo.ts), in plain words. */
export const AEO_EXPLANATIONS: readonly SubScoreExplanation[] = [
  {
    key: "aeo.qaCoverage",
    name: "Questions and answers marked up",
    parts: {
      what:
        "How many of your pages use FAQ, how-to or Q&A structured data, which tells machines " +
        "“this is a question, and this is its answer”. Full marks when a quarter of your pages do.",
      why: "Marked-up answers are the easiest for Google and AI assistants to lift into their results.",
      todo:
        "Add FAQ structured data to pages that already answer common questions, such as your " +
        "FAQ, pricing or opening-hours pages.",
      worth: "It's quick to do on pages you already have, and it makes those answers stand out.",
    },
    summarise: qaCoverage,
  },
  {
    key: "aeo.conciseAnswers",
    name: "Short, direct answers",
    parts: {
      what:
        "Of the headings on your pages that ask a question, how many are answered straight away " +
        "by a short paragraph of 60 words or fewer.",
      why:
        "Google and AI assistants quote short answers that sit right under the question. Long or " +
        "buried answers get passed over.",
      todo:
        "Under each question heading, start with a two- or three-sentence answer, then add the " +
        "detail after it.",
      worth: "It makes your pages easier for people to read too, not just machines.",
    },
    summarise: conciseAnswers,
  },
  {
    key: "aeo.preferredSources",
    name: "Fresh pages",
    parts: {
      what:
        "Whether you've published or updated at least three pages in the last 30 days. News " +
        "sites also get credit for Google's Preferred Sources button, which lets readers choose " +
        "to see more of you in Google's news results.",
      why: "Search engines and AI assistants trust a site that is looked after, and fresh pages show it is.",
      todo:
        "Keep publishing or updating pages regularly, even small ones. If you run a news site, " +
        "add the Preferred Sources button too.",
      worth: "Regular updates help in every area, and readers who choose you see more of you.",
    },
    summarise: preferredSources,
  },
  {
    key: "aeo.snippets",
    name: "Featured answers on Google",
    parts: {
      what:
        "Whether Google shows your page as the highlighted answer at the top of its results for " +
        "the questions you care about.",
      why: "It's the clearest sign that Google trusts your answer more than anyone else's.",
      todo:
        "Nothing for now. This needs paid rankings data, which isn't connected yet, so it " +
        "doesn't count towards the score.",
      worth: "Once it's connected, you'll see which questions you already win and which are close.",
    },
    // Always missing until a paid source is connected: subScoreLine reads its reason instead.
    summarise: () => null,
  },
];
