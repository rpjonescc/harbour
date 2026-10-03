import { collectorLabel } from "@/lib/scan/labels";
import type { CollectorStatus } from "@/lib/scan/types";

export type SourceState = "connected" | "notConnected" | "failed" | "waiting";

/** A data source in plain words. Setting names (HARBOUR_…) appear only in `connect`. */
export type SourceExplanation = {
  /** A collector id (lib/scan/labels) or a paid source id (lib/costs/paid-sources). */
  id: string;
  name: string;
  /** What it gives Harbour, in one sentence. */
  gives: string;
  paid: boolean;
  /** How to connect it, step by step. */
  connect: readonly string[];
  status: Readonly<Record<SourceState, string>>;
};

const BUILT_IN = ["Nothing to set up: it runs with every daily check."];
export const RESTART_WORKER =
  "Restart the worker so it picks up the change: systemctl --user restart harbour-worker.";
const BUILT_IN_STATUS = { connected: "Working", notConnected: "Always on: nothing to connect" };
const PAID_STATUS = {
  connected: "Connected",
  notConnected: "Not available yet",
  failed: "Didn't answer in the last check",
  waiting: "Paused until next month: the monthly budget is used up",
};
const ASKED = "when asked your customers' questions.";

/** What every paid source says today: there is no collector for it yet. */
export const NOT_COLLECTED_YET = "Harbour doesn't collect this data yet.";

/** Paid sources have no collector yet (lib/costs/paid-sources), so connecting is a later step. */
function paidSteps(settings: string): string[] {
  return [
    NOT_COLLECTED_YET,
    `When it does, you'll add ${settings} to .env, set a monthly budget (HARBOUR_MONTHLY_BUDGET_AUD) and restart the worker.`,
  ];
}

export const SOURCES: readonly SourceExplanation[] = [
  {
    id: "crawler",
    name: "Page check",
    gives:
      "Visits your site the way Google does and reads each page's title, headings, links and answers.",
    paid: false,
    connect: BUILT_IN,
    status: {
      ...BUILT_IN_STATUS,
      failed: "Couldn't read your site in the last check",
      waiting: "Runs with the next check",
    },
  },
  {
    id: "readiness",
    name: "Site setup check",
    gives:
      "Reads the files that tell search engines and AI assistants how to treat your site: " +
      "robots.txt, your sitemap, llms.txt and the structured data on your pages.",
    paid: false,
    connect: BUILT_IN,
    status: {
      ...BUILT_IN_STATUS,
      failed: "Couldn't read your site's setup files in the last check",
      waiting: "Runs with the next check",
    },
  },
  {
    id: "pagespeed",
    name: "Google speed test (PageSpeed)",
    gives: "Measures how fast your home page loads and responds on a phone, once a week.",
    paid: false,
    connect: [
      "In the Google Cloud console, enable the PageSpeed Insights API and create a free API key restricted to it.",
      "Add the key to .env as HARBOUR_PAGESPEED_API_KEY.",
      RESTART_WORKER,
    ],
    status: {
      connected: "Connected",
      notConnected: "Not connected yet",
      failed: "Google's speed test didn't answer in the last check",
      waiting: "Runs once a week: waiting for the next run",
    },
  },
  {
    id: "search-console",
    name: "Google Search Console",
    gives:
      "Shows how often Google showed your pages in search, which searches found you and how many people clicked. " +
      "It also checks which pages Google has indexed.",
    paid: false,
    connect: [
      "Run pnpm gsc:connect on the Harbour machine and sign in with the Google account that can see your sites in Search Console.",
      "Set HARBOUR_GSC_CREDENTIALS in .env to the file it saved.",
      "Give each product its searchConsoleProperty in harbour.config.json.",
      RESTART_WORKER,
    ],
    status: {
      connected: "Connected",
      notConnected: "Not connected yet",
      failed: "Google didn't send the data in the last check",
      waiting: "Runs with the next check",
    },
  },
  {
    id: "indexing",
    name: "Google page index check",
    gives:
      "Asks Google which of your sitemap pages it has added to its search results, up to 100 a day.",
    paid: false,
    connect: ["Nothing more to set up: it uses your Google Search Console connection."],
    status: {
      connected: "Working",
      notConnected: "Needs Google Search Console first",
      failed: "Google didn't answer the page checks in the last check",
      waiting: "Runs with the next check",
    },
  },
  {
    id: "dataforseo",
    name: "Google rankings (DataForSEO)",
    gives:
      "Where your pages rank on Google for the searches you care about, and which answers Google highlights at the top.",
    paid: true,
    connect: paidSteps("HARBOUR_DATAFORSEO_LOGIN and HARBOUR_DATAFORSEO_PASSWORD"),
    status: PAID_STATUS,
  },
  {
    id: "openai",
    name: "ChatGPT checks (OpenAI)",
    gives: `Whether ChatGPT mentions and links to your sites ${ASKED}`,
    paid: true,
    connect: paidSteps("HARBOUR_OPENAI_API_KEY"),
    status: PAID_STATUS,
  },
  {
    id: "perplexity",
    name: "Perplexity checks",
    gives: `Whether Perplexity mentions and links to your sites ${ASKED}`,
    paid: true,
    connect: paidSteps("HARBOUR_PERPLEXITY_API_KEY"),
    status: PAID_STATUS,
  },
  {
    id: "gemini",
    name: "Gemini checks (Google)",
    gives: `Whether Gemini mentions and links to your sites ${ASKED}`,
    paid: true,
    connect: paidSteps("HARBOUR_GEMINI_API_KEY"),
    status: PAID_STATUS,
  },
];

const BY_ID = new Map(SOURCES.map((source) => [source.id, source]));
/** For a source Harbour no longer knows (an old collector id in stored runs). */
const GENERIC: Readonly<Record<SourceState, string>> = {
  connected: "Working",
  notConnected: "Not connected yet",
  failed: "Had a problem in the last check",
  waiting: "Waiting for the next check",
};
const STATE_OF: Readonly<Record<CollectorStatus, SourceState>> = {
  ok: "connected",
  not_configured: "notConnected",
  failed: "failed",
  skipped: "waiting",
};

/** A data source's plain name; an unknown id falls back to its collector label. */
export function sourceName(id: string): string {
  return BY_ID.get(id)?.name ?? collectorLabel(id);
}

/** A data source's explanation by id. Throws for an id Harbour doesn't know, so a typo is loud. */
export function sourceExplanation(id: string): SourceExplanation {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`No explanation for data source "${id}"`);
  return found;
}

/** How a source stands after its latest run (null: it has not run yet), in plain words. */
export function sourceStatusPhrase(id: string, status: CollectorStatus | null): string {
  const state = status === null ? "waiting" : STATE_OF[status];
  return (BY_ID.get(id)?.status ?? GENERIC)[state];
}

/** One line naming the data sources that failed in the last check; null when none did. */
export function sourceTrouble(failures: readonly { collector: string }[]): string | null {
  const ids = [...new Set(failures.map((f) => f.collector))];
  const [only] = ids;
  if (only === undefined) return null;
  if (ids.length === 1) return `${sourceName(only)} had a problem in the last check`;
  return `${ids.length} data sources had a problem in the last check`;
}
