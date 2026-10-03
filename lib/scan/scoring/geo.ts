import { AI_RETRIEVAL_AGENTS } from "../robots";
import { hasSchemaFamily } from "../schema-types";
import type { Crawl, Readiness } from "./inputs";
import { type HtmlPage, htmlPages } from "./pages";
import {
  measured,
  missing,
  plural,
  type SubScore,
  type SubScoreSpec,
  withSources,
} from "./sub-score";

/** Half of a site's pages being citation-ready is full marks: home and contact pages rarely are. */
const CITATION_TARGET = 0.5;
/** An Organization (or LocalBusiness) says who is behind the site; WebSite names the site. */
const ORGANIZATION_POINTS = 60;
const WEBSITE_POINTS = 40;

/** "4 of 4 search and retrieval agents" for one class of crawler. */
function classNote(entries: [string, string][], retrieval: boolean): string | null {
  const members = entries.filter(([name]) => AI_RETRIEVAL_AGENTS.has(name) === retrieval);
  if (members.length === 0) return null;
  const allowed = members.filter(([, access]) => access !== "blocked").length;
  const what = retrieval
    ? plural(members.length, "search and retrieval agent")
    : `${plural(members.length, "training crawler")} (not counted)`;
  return `${allowed} of ${members.length} ${what}`;
}

/**
 * AI crawler access: the share of the search and retrieval agents robots.txt lets reach "/"
 * (some paths disallowed still counts as allowed). Training crawlers are listed but not counted
 * (formula v3): blocking them is a policy choice, not a visibility problem.
 */
export function aiCrawlerAccess(readiness: Readiness): SubScore {
  const { state, aiCrawlerAccess: access } = readiness.robotsTxt;
  if (!access) return missing(`robots.txt could not be read (${state}): AI crawler access unknown`);
  const entries = Object.entries(access);
  if (entries.length === 0) return missing("Readiness reported no AI crawlers");
  const answering = entries.filter(([name]) => AI_RETRIEVAL_AGENTS.has(name));
  if (answering.length === 0) return missing("Readiness reported no AI search agents");
  const names = (value: string) => entries.filter(([, a]) => a === value).map(([name]) => name);
  const blocked = names("blocked");
  const partial = names("partial");
  const answeringAllowed = answering.filter(([, a]) => a !== "blocked").length;
  const classes = [classNote(entries, true), classNote(entries, false)].filter((n) => n !== null);
  const allowed = entries.length - blocked.length;
  const notes = [
    `${allowed} of ${entries.length} AI crawlers may fetch the home page: ${classes.join(", ")}`,
  ];
  const label = (name: string) =>
    AI_RETRIEVAL_AGENTS.has(name) ? name : `${name} (training only)`;
  if (blocked.length > 0) notes.push(`blocked: ${blocked.map(label).join(", ")}`);
  if (partial.length > 0) notes.push(`some paths disallowed for: ${partial.join(", ")}`);
  return measured((100 * answeringAllowed) / answering.length, `${notes.join("; ")}.`);
}

/**
 * llms.txt: 100 when the site serves it, 0 when it does not; unknown is missing. Weight 0 from
 * formula v3: measured for information, since Google says it neither helps nor harms.
 */
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
    `Of ${schema.pagesChecked} HTML pages: ${organization} ` +
    `${plural(organization, "declares", "declare")} an Organization or ` +
    `LocalBusiness, ${website} the WebSite.`;
  return measured(score, evidence);
}

/** FAQ and HowTo markup stopped counting in formula v3: Google no longer shows those results. */
function isCitationReady(page: HtmlPage): boolean {
  return hasSchemaFamily(page.jsonLdTypes, "Article") || page.questionHeadings > 0;
}

/**
 * Citation-ready content: the share of HTML pages with Article schema or question-style
 * headings, against a target of half the pages.
 */
export function citationReady(crawl: Crawl): SubScore {
  const html = htmlPages(crawl.pages);
  if (html.length === 0) return missing("No HTML pages were crawled to check");
  const ready = html.filter(isCitationReady).length;
  const evidence =
    `${ready} of ${html.length} HTML pages have Article schema or question-style headings ` +
    "(full marks at half the pages).";
  return measured(100 * Math.min(1, ready / html.length / CITATION_TARGET), evidence);
}

/**
 * GEO sub-scores of formula v3; scored weights sum to 1. v3 set llms.txt to 0 and spread its
 * 15% over the rest in proportion (30:25:30 becomes 35:30:35, whole percents).
 */
export const GEO_SUB_SCORES: readonly SubScoreSpec[] = [
  {
    key: "geo.aiCrawlers",
    label: "AI crawler access",
    weight: 0.35,
    measure: (i) => withSources([i.readiness], aiCrawlerAccess),
  },
  {
    key: "geo.llmsTxt",
    label: "llms.txt",
    weight: 0,
    measure: (i) => withSources([i.readiness], llmsTxt),
  },
  {
    key: "geo.entities",
    label: "Entity structured data",
    weight: 0.3,
    measure: (i) => withSources([i.crawl, i.readiness], (_crawl, r: Readiness) => entitySchema(r)),
  },
  {
    key: "geo.citations",
    label: "Citation-ready content",
    weight: 0.35,
    measure: (i) => withSources([i.crawl], citationReady),
  },
  {
    key: "geo.aiEngines",
    label: "AI engine mentions",
    weight: 0,
    measure: () =>
      missing("AI engine mentions are measured in the outside view, not counted in the score yet."),
  },
];
