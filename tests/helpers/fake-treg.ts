/** A local fake Treg server and a collector run against it. Synthetic answers only; no network. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getConfig } from "@/lib/config";
import type { Product } from "@/lib/products/catalog";
import type { ProductTracking } from "@/lib/products/config";
import { createTreg, type TregDeps } from "@/lib/scan/collectors/treg";
import { AI_CHATGPT, BACKLINKS, SERP_ORGANIC } from "@/lib/scan/collectors/treg-endpoints";
import { createSafeFetch } from "@/lib/scan/fetch";
import { HostLimiter } from "@/lib/scan/host-limiter";
import type { CollectContext, Collector, CollectorResult } from "@/lib/scan/types";
import { type Answers, DOMAIN, okBody } from "./fake-treg-answers";
import { site } from "./http-site";

export const KEY = "SENTINEL-treg-key-9f3a";
export { aiBody, backlinksBody, DOMAIN, serpBody } from "./fake-treg-answers";

export type Mode =
  | "ok"
  | "route_max_cost"
  | "balance"
  | "unauthorized"
  | "forbidden"
  | "rate_limit"
  | "server_error"
  | "hang"
  | "huge"
  | "malformed"
  | "wrong_shape"
  | "no_cost_header"
  | "bad_cost_header"
  | "unknown_endpoint";

export type Call = {
  endpoint: string;
  headers: IncomingMessage["headers"];
  rawBody: string;
  json: unknown;
};

const COST: Record<string, string> = {
  [BACKLINKS.id]: "2500",
  [SERP_ORGANIC.id]: "6000",
  [AI_CHATGPT.id]: "3600",
};

function respond(
  res: ServerResponse,
  mode: Mode,
  endpoint: string,
  answers: Answers,
  charge: string | undefined,
): void {
  const json = { "content-type": "application/json" };
  const cost = { "x-treg-cost-micro": charge ?? COST[endpoint] ?? "1", "x-treg-call-id": "call-1" };
  switch (mode) {
    case "ok":
      res.writeHead(200, { ...json, ...cost }).end(JSON.stringify(okBody(endpoint, answers)));
      return;
    case "no_cost_header":
      res.writeHead(200, json).end(JSON.stringify(okBody(endpoint, answers)));
      return;
    case "bad_cost_header":
      res
        .writeHead(200, { ...json, "x-treg-cost-micro": "lots" })
        .end(JSON.stringify(okBody(endpoint, answers)));
      return;
    case "route_max_cost":
      res
        .writeHead(402, { ...json, "x-treg-error": "1" })
        .end(JSON.stringify({ detail: { error: "route_max_cost", message: "too dear" } }));
      return;
    case "balance":
      res.writeHead(402, json).end(JSON.stringify({ detail: { error: "insufficient_balance" } }));
      return;
    case "unauthorized":
      res.writeHead(401, json).end('{"detail":"bad key"}');
      return;
    case "forbidden":
      res.writeHead(403, json).end('{"detail":"no"}');
      return;
    case "rate_limit":
      res.writeHead(429, json).end('{"detail":"slow down"}');
      return;
    case "server_error":
      res
        .writeHead(503, { ...json, ...(charge ? { "x-treg-cost-micro": charge } : {}) })
        .end('{"detail":"down"}');
      return;
    case "unknown_endpoint":
      res.writeHead(404, json).end('{"detail":"unknown endpoint"}');
      return;
    case "malformed":
      res.writeHead(200, { ...json, ...cost }).end("{not json");
      return;
    case "wrong_shape":
      res.writeHead(200, { ...json, ...cost }).end(JSON.stringify({ result: { data: "nope" } }));
      return;
    case "huge":
      res.writeHead(200, { ...json, ...cost }).end("x".repeat(1024 * 1024 + 4096));
      return;
    case "hang":
      return;
  }
}

export type FakeTregOptions = {
  /** How each call is answered, by endpoint id and call number (1 is the first). */
  mode?: Mode | ((endpoint: string, n: number, call: Call) => Mode);
  answers?: Answers | ((endpoint: string, n: number) => Answers);
  /** The charge in micro-USD the fake reports per endpoint id (default: the estimate). */
  charges?: Record<string, string>;
};

/** Starts the fake on 127.0.0.1; every call it gets is recorded in `calls`. */
export async function fakeTreg(options: FakeTregOptions = {}) {
  const calls: Call[] = [];
  const handler = (endpoint: string) => (req: IncomingMessage, res: ServerResponse) => {
    let rawBody = "";
    req.on("data", (chunk) => {
      rawBody += chunk;
    });
    req.on("end", () => {
      let json: unknown = null;
      try {
        json = JSON.parse(rawBody);
      } catch {}
      const call: Call = { endpoint, headers: req.headers, rawBody, json };
      calls.push(call);
      const n = calls.length;
      const { mode = "ok", answers = {} } = options;
      const chosen = typeof mode === "function" ? mode(endpoint, n, call) : mode;
      respond(
        res,
        chosen,
        endpoint,
        typeof answers === "function" ? answers(endpoint, n) : answers,
        options.charges?.[endpoint],
      );
    });
  };
  const ids = [BACKLINKS.id, SERP_ORGANIC.id, AI_CHATGPT.id];
  const { origin } = await site(Object.fromEntries(ids.map((id) => [`/call/${id}`, handler(id)])));
  return { origin, calls };
}

export const product: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: `https://www.${DOMAIN}/`,
  hue: "amber",
  kind: "product",
};

export const TRACKING: ProductTracking = {
  queries: ["acme docs", "best docs tools"],
  questions: ["What are good tools for team documentation?"],
  country: "AU",
  languageCode: "en",
};

/** A safe fetch that reaches the fake as if it were treg.to. */
export function fakeFetch(timeoutMs = 5_000) {
  return createSafeFetch({
    allowedHosts: new Set(["127.0.0.1"]),
    allowLoopback: true,
    customHeaderHosts: ["127.0.0.1"],
    timeoutMs,
    limiter: new HostLimiter({ concurrency: 2, spacingMs: 1 }),
  });
}

export const deps = (origin: string): TregDeps => ({
  tracking: () => TRACKING,
  baseUrl: origin,
  timeoutMs: 5_000,
  clock: Date.now,
});

export type Spent = {
  estimates: number[];
  recorded: { provider: string; units: number; amountMicroAud: number }[];
};

export type RunSetup = {
  origin: string;
  tracking?: ProductTracking | null;
  key?: string | null;
  rate?: number;
  /** Budget in calls: the nth `allow` and every later one is refused. */
  allowCalls?: number;
  timeoutMs?: number;
  clock?: () => number;
  signal?: AbortSignal;
  product?: Partial<Product>;
  /** A run the owner asked for by hand. */
  manual?: boolean;
  /** Reuse one collector across runs (it remembers a halt). */
  collector?: Collector;
};

/** Runs the collector once against the fake; collects the budget asks, costs and log lines. */
export async function tregRun(setup: RunSetup) {
  const log: string[] = [];
  const spent: Spent = { estimates: [], recorded: [] };
  const key = setup.key === undefined ? KEY : setup.key;
  const base = getConfig();
  const config = {
    ...base,
    HARBOUR_TREG_API_KEY: key ?? undefined,
    HARBOUR_USD_TO_AUD: setup.rate ?? 1.55,
  };
  const ctx: CollectContext = {
    product: { ...product, ...setup.product },
    config,
    now: new Date("2026-10-04T06:00:00Z"),
    fetch: fakeFetch(setup.timeoutMs),
    log: (m) => log.push(m),
    manual: setup.manual ?? false,
    signal: setup.signal ?? new AbortController().signal,
    earlier: { status: () => undefined, observations: () => [] },
    previous: { observations: () => [] },
    cost: { record: (entry) => spent.recorded.push(entry) },
    budget: {
      allow: (estimate) => {
        spent.estimates.push(estimate);
        return spent.estimates.length <= (setup.allowCalls ?? Number.POSITIVE_INFINITY);
      },
    },
  };
  const tracking = setup.tracking === undefined ? TRACKING : setup.tracking;
  const deps: TregDeps = {
    tracking: () => tracking,
    baseUrl: setup.origin,
    timeoutMs: setup.timeoutMs ?? 5_000,
    clock: setup.clock ?? Date.now,
  };
  let result: CollectorResult | null = null;
  let error: Error | null = null;
  try {
    result = await (setup.collector ?? createTreg(deps)).collect(ctx);
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }
  return { result, error, log, spent };
}

/** The observations of one kind from an ok result. */
export function observed(result: CollectorResult | null, kind: string) {
  if (result?.status !== "ok") throw new Error(`expected ok, got ${result?.status}`);
  return result.observations.filter((o) => o.kind === kind);
}
