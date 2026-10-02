import type { IssueArea } from "@/lib/scan/issues";
import type { AreaKey } from "@/lib/scan/views";
import type { FourParts } from "./four-parts";

/** An area in the owner's words. Its code (SEO, GEO, AEO) appears only in Technical details. */
export type AreaExplanation = {
  key: AreaKey;
  code: IssueArea;
  name: string;
  oneLiner: string;
  parts: FourParts;
};

/**
 * The areas in display order. Defined here rather than imported from lib/scan/views, so client
 * components that use the area names never bundle the database layer.
 */
export const AREA_ORDER: readonly AreaKey[] = ["seo", "geo", "aeo"];

export const AREAS: Readonly<Record<AreaKey, AreaExplanation>> = {
  seo: {
    key: "seo",
    code: "SEO",
    name: "Found on Google",
    oneLiner: "Google can find, read and rank your pages.",
    parts: {
      what:
        "How easily Google can find your pages, read them and show them to people searching. " +
        "Harbour combines four checks: the health of your pages, whether Google is allowed in, " +
        "how fast your site feels on a phone, and whether Google is showing you more or less often.",
      why:
        "Most people still start with a Google search. If Google can't reach or understand a " +
        "page, that page can't bring you visitors, however good it is.",
      todo:
        "Start with the weakest check and the matching ideas under Worth doing next. Most fixes " +
        "are small edits to page titles, descriptions or links.",
      worth:
        "Every visitor from Google is free, and small fixes here keep paying off for as long as " +
        "the page is online.",
    },
  },
  geo: {
    key: "geo",
    code: "GEO",
    name: "Recommended by AI assistants",
    oneLiner:
      "ChatGPT, Perplexity, Gemini and Claude can reach your site, know who you are, and cite you.",
    parts: {
      what:
        "Whether AI assistants such as ChatGPT, Perplexity, Gemini and Claude can read your site, " +
        "understand who is behind it and point people to it in their answers.",
      why:
        "More and more people ask an AI assistant instead of searching. Assistants can only " +
        "recommend sites they're allowed to read and can make sense of.",
      todo:
        "Let AI crawlers (the programs assistants send to read websites) in, add a short " +
        "llms.txt guide, say clearly who runs the site, and answer questions plainly. Worth doing " +
        "next lists the changes for each site.",
      worth:
        "When an assistant names you, it works like a personal recommendation, and it often comes " +
        "with a link people trust.",
    },
  },
  aeo: {
    key: "aeo",
    code: "AEO",
    name: "Answer-ready",
    oneLiner: "Your pages give short, direct answers that Google and AI assistants can quote.",
    parts: {
      what:
        "How well your pages answer common questions in a short, direct way, so Google and AI " +
        "assistants can lift the answer straight into their results.",
      why:
        "Google often shows an answer at the top of its results, and assistants quote whole " +
        "sentences. Pages set out as clear questions and answers are the ones that get picked.",
      todo:
        "Add a few common questions as headings, answer each in two or three sentences right " +
        "underneath, and mark up FAQ pages so machines can tell they're questions and answers.",
      worth:
        "Being the quoted answer puts your name at the very top, ahead of every ordinary link.",
    },
  },
};

/**
 * An area's next step: its actions on the board. The board opens on To do and In progress, so
 * the label promises what's worth doing there, not new ideas.
 */
export function areaNextStep(key: AreaKey): { href: string; label: string } {
  const area = AREAS[key];
  return { href: `/actions?area=${area.code}`, label: `See what's worth doing for ${area.name}` };
}

const KEY_OF: Readonly<Record<IssueArea, AreaKey>> = { SEO: "seo", GEO: "geo", AEO: "aeo" };

/** The area key for an action's area code. */
export function areaKeyOf(area: IssueArea): AreaKey {
  return KEY_OF[area];
}
