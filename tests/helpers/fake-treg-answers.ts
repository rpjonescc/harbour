/** Synthetic Treg answers, shaped as the spec describes them. Fictional data only. */
import { BACKLINKS, LINKING_DOMAINS, SERP_ORGANIC } from "@/lib/scan/collectors/treg-endpoints";

export const DOMAIN = "docs.example.com";

/** What the fake answers with when `mode` is "ok". */
export type Answers = {
  /** Our rank_group among organic results; null: not among them. */
  rank?: number | null;
  /** The domain our result is under (default docs.example.com). */
  domain?: string;
  /** The text ChatGPT "wrote". */
  text?: string;
  /** Source URLs the answer cites. */
  sources?: string[];
  entities?: unknown[] | null;
  /** The linking domains the list call returns (default: four outside sites, 30 pages each). */
  /** The summary's counts (default 40 domains, so no list call; 120 links). */
  referringDomains?: number;
  backlinks?: number;
  linkingRows?: { domain_from: string; ref_pages: number }[];
};

export const OUTSIDERS = ["a.example.org", "b.example.org", "c.example.org", "d.example.org"].map(
  (domain_from) => ({ domain_from, ref_pages: 30 }),
);

/** The list answer: `{"domain_from", "ref_pages", "domainRank"}` rows under result.data. */
export function linkingBody(rows = OUTSIDERS) {
  return { result: { data: rows.map((row) => ({ ...row, domainRank: 0 })) } };
}

export function backlinksBody(referringDomains = 40, backlinks = 120) {
  return {
    result: {
      data: {
        referring_domains: referringDomains,
        backlinks,
        dofollow_backlinks: 80,
        nofollow_backlinks: 40,
        sersptat_domain_rank: 12.5,
        extra: "ignored",
      },
    },
  };
}

export function serpBody(rank: number | null, ours = DOMAIN) {
  const organic = (n: number, domain: string) => ({
    type: "organic",
    rank_group: n,
    rank_absolute: n + 1,
    domain,
    url: `https://${domain}/page`,
    title: `Result ${n}`,
  });
  const items: Record<string, unknown>[] = [
    { type: "paid", rank_group: 1, domain: "ads.example.net", url: "https://ads.example.net/" },
    { type: "featured_snippet", domain: ours, url: `https://${ours}/snippet` },
  ];
  for (let n = 1; n <= 30; n++) {
    items.push(
      n === rank
        ? { ...organic(n, ours), url: `https://${ours}/guide` }
        : organic(n, `site-${n}.example.net`),
    );
  }
  return { tasks: [{ status_code: 20000, result: [{ items }] }] };
}

export function aiBody({ text, sources, entities }: Answers) {
  return {
    result: {
      text: text ?? "Several tools exist for team documentation.",
      sources: (sources ?? []).map((url) => ({ url, title: "t" })),
      entities: entities === undefined ? [{ name: "One" }, { name: "Two" }] : entities,
      citationPills: [],
    },
  };
}

export function okBody(endpoint: string, answers: Answers): unknown {
  if (endpoint === BACKLINKS.id) return backlinksBody(answers.referringDomains, answers.backlinks);
  if (endpoint === LINKING_DOMAINS.id) return linkingBody(answers.linkingRows);
  if (endpoint === SERP_ORGANIC.id)
    return serpBody(answers.rank === undefined ? 4 : answers.rank, answers.domain);
  return aiBody(answers);
}
