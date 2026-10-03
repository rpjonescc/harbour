import { z } from "zod";
import { type AiAnswer, type Backlinks, SERP_DEPTH, type SerpRank } from "../treg-shapes";
import { cleanHost, hostMatches, hostOfUrl, listedHost, normalisedUrl } from "./treg-match";

// The one table of Treg endpoints Harbour calls: id, price, how to ask and how to read the answer.
// Prices are what `treg catalog get <id>` quotes; they change only with a code change. Every
// answer is untrusted: read with zod (extra fields ignored, what we use checked strictly), strings
// cleaned and capped. A parser gives null when the answer is not what it should be.

/** Treg's own address: https only, never redirected (see lib/scan/fetch.ts). */
export const TREG_BASE_URL = "https://treg.to";

/** The most one call may be charged, whatever the estimate: US$0.05. */
export const MAX_CEILING_MICRO_USD = 50_000;
const CEILING_FACTOR = 1.5;

/** The hard per-call price ceiling, in micro-USD: 1.5 times the estimate, never above US$0.05. */
export function ceilingMicroUsd(estimateMicroUsd: number): number {
  return Math.min(Math.round(estimateMicroUsd * CEILING_FACTOR), MAX_CEILING_MICRO_USD);
}

/** Micro-USD as the plain USD decimal the `X-Treg-Route-Max-Cost` header takes, e.g. "0.00375". */
export function ceilingHeaderValue(microUsd: number): string {
  return (microUsd / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export type Endpoint<In, Out> = {
  /** The provider's id in Treg's catalogue, also the call's path. */
  id: string;
  /** Who answers, as stored with a backlinks result. */
  provider: string;
  /** What one call is expected to cost, in micro-USD (the base, when the price depends on the input). */
  estimateMicroUsd: number;
  /** The price of one call for this input, when it is not a flat one (a list is priced per row). */
  estimateFor?(input: In): number;
  /** The JSON body to send. */
  request(input: In): unknown;
  /** What the answer says, or null when it is not readable. */
  parse(body: unknown, input: In): Out | null;
};

const count = z.number().int().nonnegative().max(1e12);
const MAX_ITEMS = 200;

type BacklinksIn = { domain: string };
type BacklinksOut = Pick<Backlinks, "referringDomains" | "backlinks" | "dofollow" | "rank">;

const backlinksAnswer = z.object({
  result: z.object({
    data: z.object({
      referring_domains: count,
      backlinks: count,
      dofollow_backlinks: count,
      // Spelled as the provider spells it.
      sersptat_domain_rank: z.number().nonnegative().max(1e12).nullish(),
    }),
  }),
});

export const BACKLINKS: Endpoint<BacklinksIn, BacklinksOut> = {
  id: "serpstat.web.backlinks.summary",
  provider: "serpstat",
  estimateMicroUsd: 2_500,
  request: ({ domain }) => ({
    method: "SerpstatBacklinksProcedure.getSummaryV2",
    id: "1",
    params: { query: domain },
  }),
  parse(body) {
    const parsed = backlinksAnswer.safeParse(body);
    if (!parsed.success) return null;
    const data = parsed.data.result.data;
    return {
      referringDomains: data.referring_domains,
      backlinks: data.backlinks,
      dofollow: data.dofollow_backlinks,
      rank: data.sersptat_domain_rank ?? null,
    };
  },
};

/** The extra links call is made only for a site with at most this many linking domains. */
export const MAX_LISTED_DOMAINS = 25;
/** What each returned row costs, in micro-USD. */
export const LINKING_ROW_MICRO_USD = 500;

type LinkingIn = { domain: string; rows: number };
/** The distinct linking hosts with their page counts, and how many list rows could not be read. */
type LinkingOut = { rows: { host: string; pages: number }[]; dropped: number };

// The rows are `{domain_from, ref_pages, domainRank}`; the list sits under result.data. One odd row
// does not spoil the list: a row whose domain is not a plain host is dropped and counted (never
// quoted), a missing or odd page count is 0, and the same domain twice is one domain.
const linkingAnswer = z.object({
  result: z.object({ data: z.array(z.unknown()).max(MAX_ITEMS) }),
});

/** A page count, or 0 when the row has none that makes sense. */
const pagesOf = (raw: unknown): number => {
  const parsed = count.safeParse(raw);
  return parsed.success ? parsed.data : 0;
};

export const LINKING_DOMAINS: Endpoint<LinkingIn, LinkingOut> = {
  id: "serpstat.web.linking_domains.list",
  provider: "serpstat",
  estimateMicroUsd: LINKING_ROW_MICRO_USD,
  estimateFor: ({ rows }) => LINKING_ROW_MICRO_USD * rows,
  request: ({ domain, rows }) => ({
    method: "SerpstatBacklinksProcedure.getRefDomains",
    id: "1",
    params: { query: domain, size: rows },
  }),
  parse(body, { rows: asked }) {
    const parsed = linkingAnswer.safeParse(body);
    if (!parsed.success) return null;
    const byHost = new Map<string, number>();
    let dropped = 0;
    // Only as many rows as were asked for: more than that is not the answer to this question.
    for (const raw of parsed.data.result.data.slice(0, asked)) {
      const row = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const host = listedHost(row.domain_from);
      if (host === null) {
        dropped += 1;
        continue;
      }
      byHost.set(host, (byHost.get(host) ?? 0) + pagesOf(row.ref_pages));
    }
    if (byHost.size === 0) return null;
    return { rows: [...byHost].map(([host, pages]) => ({ host, pages })), dropped };
  },
};

type SerpIn = { query: string; domain: string; location: string; languageCode: string };
type SerpOut = Pick<SerpRank, "position" | "url" | "topDomains">;

const serpAnswer = z.object({
  tasks: z
    .array(
      z.object({
        status_code: z.number().optional(),
        result: z
          .array(z.object({ items: z.array(z.looseObject({ type: z.string() })).max(MAX_ITEMS) }))
          .min(1),
      }),
    )
    .min(1),
});
const organicItem = z.object({
  rank_group: z.number().int().min(1).max(1_000),
  domain: z.string().optional(),
  url: z.string().optional(),
});
/** DataForSEO's own "task OK" code, when a task carries one. */
const TASK_OK = 20_000;

export const SERP_ORGANIC: Endpoint<SerpIn, SerpOut> = {
  id: "dataforseo.google.serp.organic",
  provider: "dataforseo",
  estimateMicroUsd: 6_000,
  request: ({ query, location, languageCode }) => [
    { keyword: query, location_name: location, language_code: languageCode, depth: SERP_DEPTH },
  ],
  parse(body, { domain }) {
    const parsed = serpAnswer.safeParse(body);
    const task = parsed.success ? parsed.data.tasks[0] : undefined;
    const items = task?.result[0]?.items;
    if (!task || !items) return null;
    if (task.status_code !== undefined && task.status_code !== TASK_OK) return null;
    let position: number | null = null;
    let url: string | null = null;
    const topDomains: string[] = [];
    for (const raw of items) {
      if (raw.type !== "organic") continue;
      // A malformed organic result could be ours: fail rather than report "not found".
      const item = organicItem.safeParse(raw);
      if (!item.success) return null;
      const { rank_group: rank } = item.data;
      const host = cleanHost(item.data.domain ?? "") ?? hostOfUrl(item.data.url ?? "") ?? null;
      if (rank > SERP_DEPTH || host === null) continue;
      if (topDomains.length < 5 && !topDomains.includes(host)) topDomains.push(host);
      if (hostMatches(host, domain) && (position === null || rank < position)) {
        position = rank;
        url = normalisedUrl(item.data.url ?? "");
      }
    }
    return { position, url, topDomains };
  },
};

type AiIn = { question: string; country: string; domain: string; name: string };
type AiOut = Pick<AiAnswer, "citedDomains" | "businessesNamed"> & {
  /** The answer's text, for the caller to look for the product in; never stored. */
  text: string;
  /** Hosts of every source the answer cites (all of them, for the match). */
  sourceHosts: string[];
};

const aiAnswer = z.object({
  result: z.object({
    text: z.string(),
    sources: z
      .array(z.looseObject({ url: z.string().optional() }))
      .max(MAX_ITEMS)
      .default([]),
    entities: z.array(z.unknown()).max(MAX_ITEMS).nullish(),
  }),
});

export const AI_CHATGPT: Endpoint<AiIn, AiOut> = {
  id: "cloro.ai-search.chatgpt.scrape",
  provider: "cloro",
  estimateMicroUsd: 3_600,
  request: ({ country, question }) => ({ country, prompt: question }),
  parse(body) {
    const parsed = aiAnswer.safeParse(body);
    if (!parsed.success) return null;
    const { text, sources, entities } = parsed.data.result;
    const sourceHosts = sources.flatMap((s) => {
      const host = hostOfUrl(s.url ?? "");
      return host === null ? [] : [host];
    });
    return {
      text,
      sourceHosts,
      citedDomains: [...new Set(sourceHosts)].slice(0, 8),
      businessesNamed: entities ? entities.length : null,
    };
  },
};

/** Every endpoint the weekly run uses, for the log line that says which ones it asked. */
export const ENDPOINT_IDS: readonly string[] = [
  BACKLINKS.id,
  LINKING_DOMAINS.id,
  SERP_ORGANIC.id,
  AI_CHATGPT.id,
];
