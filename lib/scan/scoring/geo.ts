import { hasSchemaFamily } from "../schema-types";
import type { Crawl, Readiness } from "./inputs";
import { type HtmlPage, htmlPages } from "./pages";
import { measured, missing, type SubScore, type SubScoreSpec, withSources } from "./sub-score";

/** Half of a site's pages being citation-ready is full marks: home and contact pages rarely are. */
const CITATION_TARGET = 0.5;
/** An Organization (or LocalBusiness) says who is behind the site; WebSite names the site. */
const ORGANIZATION_POINTS = 60;
const WEBSITE_POINTS = 40;

/**
 * AI crawler access: the share of the AI crawlers robots.txt lets reach "/" (some paths
 * disallowed still counts as allowed).
 */
export function aiCrawlerAccess(readiness: Readiness): SubScore {
  const { state, aiCrawlerAccess: access } = readiness.robotsTxt;
  if (!access) return missing(`robots.txt could not be read (${state}): AI crawler access unknown`);
  const entries = Object.entries(access);
  if (entries.length === 0) return missing("Readiness reported no AI crawlers");
  const names = (value: string) => entries.filter(([, a]) => a === value).map(([name]) => name);
  const blocked = names("blocked");
  const partial = names("partial");
  const allowed = entries.length - blocked.length;
  const notes = [`${allowed} of ${entries.length} AI crawlers may fetch the home page`];
  if (blocked.length > 0) notes.push(`blocked: ${blocked.join(", ")}`);
  if (partial.length > 0) notes.push(`some paths disallowed for: ${partial.join(", ")}`);
  return measured((100 * allowed) / entries.length, `${notes.join("; ")}.`);
}

/** llms.txt: 100 when the site serves it, 0 when it does not; unknown is missing. */
export function llmsTxt(readiness: Readiness): SubScore {
  const { llmsTxt: file, llmsFullTxt: full } = readiness;
  if (file.present === null)
    return missing("llms.txt could not be checked (no answer, 429 or 5xx)");
  const fullNote = full.present === null ? "unknown" : full.present ? "present" : "not present";
  if (!file.present) return measured(0, `No llms.txt; llms-full.txt ${fullNote}.`);
  return measured(100, `llms.txt present (${file.bytes ?? 0} bytes); llms-full.txt ${fullNote}.`);
}

/**
 * Structured data for entities: 60 when some page declares an Organization (a LocalBusiness
 * counts) and 40 when some page declares the WebSite.
 */
export function entitySchema(readiness: Readiness): SubScore {
  const { schema } = readiness;
  if (!schema)
    return missing("Readiness could not read this scan's crawl: structured data unknown");
  if (schema.pagesChecked === 0) return missing("No HTML pages were crawled to check");
  const { Organization: organization, WebSite: website } = schema.pagesWith;
  const score = (organization > 0 ? ORGANIZATION_POINTS : 0) + (website > 0 ? WEBSITE_POINTS : 0);
  const evidence =
    `Of ${schema.pagesChecked} HTML pages: ${organization} declare an Organization or ` +
    `LocalBusiness, ${website} the WebSite.`;
  return measured(score, evidence);
}

function isCitationReady(page: HtmlPage): boolean {
  const types = page.jsonLdTypes;
  const schema = (["FAQPage", "HowTo", "Article"] as const).some((f) => hasSchemaFamily(types, f));
  return schema || page.hasFaqMarkup || page.questionHeadings > 0;
}

/**
 * Citation-ready content: the share of HTML pages with FAQ, HowTo or Article schema or
 * question-style headings, against a target of half the pages.
 */
export function citationReady(crawl: Crawl): SubScore {
  const html = htmlPages(crawl.pages);
  if (html.length === 0) return missing("No HTML pages were crawled to check");
  const ready = html.filter(isCitationReady).length;
  const evidence =
    `${ready} of ${html.length} HTML pages have FAQ, HowTo or Article schema or ` +
    "question-style headings (full marks at half the pages).";
  return measured(100 * Math.min(1, ready / html.length / CITATION_TARGET), evidence);
}

/** GEO sub-scores of formula v1; scored weights sum to 1. */
export const GEO_SUB_SCORES: readonly SubScoreSpec[] = [
  {
    key: "geo.aiCrawlers",
    label: "AI crawler access",
    weight: 0.3,
    measure: (i) => withSources([i.readiness], aiCrawlerAccess),
  },
  {
    key: "geo.llmsTxt",
    label: "llms.txt",
    weight: 0.15,
    measure: (i) => withSources([i.readiness], llmsTxt),
  },
  {
    key: "geo.entities",
    label: "Entity structured data",
    weight: 0.25,
    measure: (i) => withSources([i.crawl, i.readiness], (_crawl, r: Readiness) => entitySchema(r)),
  },
  {
    key: "geo.citations",
    label: "Citation-ready content",
    weight: 0.3,
    measure: (i) => withSources([i.crawl], citationReady),
  },
  {
    key: "geo.aiEngines",
    label: "AI engine mentions",
    weight: 0,
    measure: () => missing("AI engine mention checks not connected (they need API keys)."),
  },
];
