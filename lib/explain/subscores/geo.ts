import { numbersIn, type SubScoreExplanation } from "./entry";

function aiCrawlers(evidence: string): string | null {
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
  const found = numbersIn(
    evidence,
    /^(?<ready>\d+) of (?<pages>\d+) HTML pages have FAQ, HowTo or Article schema/,
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
        "Whether your robots.txt file lets AI crawlers in. These are the programs AI companies " +
        "send to read websites. The ones that fetch pages to answer people's questions count " +
        "three times as much as ones that only collect training data.",
      why: "An assistant can't recommend a page it isn't allowed to read.",
      todo:
        "Allow the crawlers that answer questions, such as OAI-SearchBot, PerplexityBot and " +
        "Claude-SearchBot, in robots.txt. Blocking training-only crawlers is your choice and costs less.",
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
      why: "It's a simple, growing habit among websites that helps assistants find your best pages quickly.",
      todo:
        "Add a file called llms.txt to the top level of your site with a sentence about your " +
        "business and links to your key pages.",
      worth: "It takes about half an hour and costs nothing to keep up.",
    },
    summarise: llmsTxt,
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
        "How many of your pages are set out so they're easy to quote: questions as headings, FAQ " +
        "or how-to sections, or articles marked as articles. Full marks when half your pages are.",
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
        "Whether ChatGPT, Perplexity and Gemini actually mention and link to your site when asked " +
        "the questions your customers ask.",
      why: "It's the real result that all the other checks prepare you for.",
      todo:
        "Nothing for now. This needs paid data, which isn't connected yet, so it doesn't count " +
        "towards the score.",
      worth:
        "Once it's connected, you'll see directly whether assistants recommend you, and for which questions.",
    },
    // Always missing until a paid source is connected: subScoreLine reads its reason instead.
    summarise: () => null,
  },
];
