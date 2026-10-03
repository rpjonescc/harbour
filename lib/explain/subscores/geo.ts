import type { OutsideView } from "@/lib/scan/outside-view";
import { numbersIn, type SubScoreExplanation } from "./entry";

/** Formula v3 evidence marks training crawlers "(not counted)": only the answering ones score. */
function answeringCrawlers(evidence: string): string | null {
  if (!evidence.includes("(not counted)")) return null;
  const found = numbersIn(
    evidence,
    /: (?<allowed>\d+) of (?<total>\d+) search and retrieval agents?/,
    ["allowed", "total"],
  );
  if (!found) return null;
  const crawlers = found.total === 1 ? "crawler" : "crawlers";
  return (
    `${found.allowed} of the ${found.total} AI ${crawlers} that fetch pages to answer people's ` +
    "questions may read your site. Training crawlers aren't counted: blocking them is your choice."
  );
}

function aiCrawlers(evidence: string): string | null {
  const v3 = answeringCrawlers(evidence);
  if (v3) return v3;
  const all = numbersIn(evidence, /^(?<allowed>\d+) of (?<total>\d+) AI crawlers may fetch/, [
    "allowed",
    "total",
  ]);
  if (!all) return null;
  const base = `${all.allowed} of ${all.total} AI crawlers may read your site`;
  const answering = numbersIn(
    evidence,
    /(?<allowed>\d+) of (?<total>\d+) search and retrieval agents?/,
    ["allowed", "total"],
  );
  if (!answering) return `${base}.`;
  return `${base}, including ${answering.allowed} of the ${answering.total} that fetch pages to answer people's questions.`;
}

function llmsTxt(evidence: string): string | null {
  if (evidence.startsWith("llms.txt present"))
    return "Your site has an llms.txt guide for AI assistants.";
  if (evidence.startsWith("No llms.txt")) {
    return "Your site doesn't have an llms.txt guide for AI assistants yet.";
  }
  return null;
}

function entities(evidence: string): string | null {
  const found = numbersIn(
    evidence,
    /(?<org>\d+) (?:declares|declare) an Organization or LocalBusiness, (?<site>\d+) the WebSite/,
    ["org", "site"],
  );
  if (!found) return null;
  if (found.org > 0 && found.site > 0)
    return "Your site tells machines who runs it and what it's called.";
  if (found.org > 0) return "Your site says who runs it, but not what the site is called.";
  if (found.site > 0) return "Your site gives its name, but not who runs it.";
  return "Your site doesn't yet tell machines who runs it.";
}

function citations(evidence: string): string | null {
  // "FAQ, HowTo or " is formula v2's wording; v3 counts Article schema and question headings.
  const found = numbersIn(
    evidence,
    /^(?<ready>\d+) of (?<pages>\d+) HTML pages have (?:FAQ, HowTo or )?Article schema/,
    ["ready", "pages"],
  );
  return found
    ? `${found.ready} of ${found.pages} pages are set out so AI assistants can quote them easily.`
    : null;
}

/** The GEO sub-scores of the current formula (lib/scan/scoring/geo.ts), in plain words. */
export const GEO_EXPLANATIONS: readonly SubScoreExplanation[] = [
  {
    key: "geo.aiCrawlers",
    name: "AI assistants can read your site",
    parts: {
      what:
        "Whether your robots.txt file lets in the AI crawlers that fetch pages to answer " +
        "people's questions. These are the programs AI companies send to read websites. " +
        "Crawlers that only collect training data are listed but don't count either way.",
      why: "An assistant can't recommend a page it isn't allowed to read.",
      todo:
        "Allow the crawlers that answer questions, such as OAI-SearchBot, PerplexityBot and " +
        "Claude-SearchBot, in robots.txt. Whether to block training crawlers is your choice.",
      worth: "It's often a one-line change that opens your site to every major assistant.",
    },
    summarise: aiCrawlers,
  },
  {
    key: "geo.llmsTxt",
    name: "A guide for AI assistants (llms.txt)",
    parts: {
      what:
        "Whether your site has an llms.txt file: a short plain-text guide at the top level of " +
        "your site that tells AI assistants what you do and which pages matter most.",
      why:
        "Google says llms.txt neither helps nor harms, and no AI assistant is known to use it, " +
        "so Harbour checks for it but doesn't count it.",
      todo: "Nothing for the score. Keep one if you already have it; there's no need to add one.",
      worth: "Your time is better spent on pages that answer your customers' questions.",
    },
    summarise: llmsTxt,
    notCounted: "Measured, not counted: llms.txt has no known effect.",
  },
  {
    key: "geo.entities",
    name: "Says who you are",
    parts: {
      what:
        "Whether your pages carry structured data (labels written for machines) naming the " +
        "business behind the site and the site itself.",
      why: "Assistants need to know who you are before they'll name you. These labels take out the guesswork.",
      todo:
        "Add Organization (or LocalBusiness) and WebSite structured data to your home page. Most " +
        "website builders have a setting or plug-in for it.",
      worth:
        "It's a one-off change that helps Google and every assistant connect your site to your name.",
    },
    summarise: entities,
  },
  {
    key: "geo.citations",
    name: "Easy for AI to quote",
    parts: {
      what:
        "How many of your pages are set out so they're easy to quote: questions as headings, or " +
        "articles marked as articles. Full marks when half your pages are.",
      why:
        "Assistants cite pages that answer a question cleanly. A page that buries the answer in a " +
        "long paragraph gets skipped.",
      todo:
        "On your most important pages, add headings that ask the questions customers ask, with " +
        "the answer straight underneath.",
      worth: "Every page you improve is another chance to be cited.",
    },
    summarise: citations,
  },
  {
    key: "geo.aiEngines",
    name: "Mentioned by AI assistants",
    parts: {
      what:
        "Whether AI assistants mention and link to your site when asked the questions your " +
        "customers ask. How the web sees you checks this once a week.",
      why: "It's the real result that all the other checks prepare you for.",
      todo:
        "Nothing here. See How the web sees you for the answers. They aren't counted in the " +
        "score yet, because answers vary from one run to the next.",
      worth: "You see directly whether assistants recommend you, and for which questions.",
    },
    // Never scored yet: subScoreLine reads aiEnginesLine (or the stored reason) instead.
    summarise: () => null,
  },
];

/** Where AI assistant mentions stand, by the state of How the web sees you. */
const AI_ENGINES_LINES: Readonly<Record<OutsideView["state"], string>> = {
  ready: "Measured in How the web sees you, not counted in the score yet.",
  not_checked:
    "How the web sees you hasn't asked AI assistants yet. It isn't counted in the score yet.",
  no_searches:
    "Not measured: no questions are chosen for How the web sees you. It isn't counted in the score yet.",
  not_connected:
    "Not measured: Treg isn't connected, so Harbour can't ask AI assistants about you. It isn't counted in the score yet.",
};

/** The plain line for AI engine mentions, given the state of How the web sees you. */
export const aiEnginesLine = (state: OutsideView["state"]) => AI_ENGINES_LINES[state];
