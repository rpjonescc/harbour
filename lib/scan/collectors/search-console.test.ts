import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crawlContext } from "@/tests/helpers/crawl";
import { AUTHORIZED_USER, SERVICE_ACCOUNT } from "@/tests/helpers/gsc";
import { FetchError } from "../fetch-error";
import type { SafeFetch, SafeFetchOptions } from "../types";
import type { GscCredentials } from "./gsc-credentials";
import { createSearchConsole } from "./search-console";

const FIXTURES = join(import.meta.dirname, "../../../tests/fixtures/search-console");
const recorded = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const PROPERTY = "sc-domain:docs.example.com";
const TOKEN = "test-access-token-xyz";
const ENDPOINT =
  "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Adocs.example.com/searchAnalytics/query";

type Call = { url: string; options: SafeFetchOptions };

const BY_DIMENSION: Record<string, string> = {
  date: recorded("by-date.json"),
  query: recorded("by-query.json"),
  page: recorded("by-page.json"),
};

/** A fake Search Console answering each report from its recorded response. */
function searchConsoleApi(status = 200, body?: string) {
  const calls: Call[] = [];
  const fetch: SafeFetch = async (url, options) => {
    calls.push({ url, options });
    const json = options.post?.json as { dimensions: string[] };
    const answer = body ?? BY_DIMENSION[json.dimensions[0] ?? ""] ?? "";
    const base = { url, finalUrl: url, redirects: [], status, headers: {}, headerLines: [] };
    return { ...base, body: answer, truncated: false, ms: 300 };
  };
  return { fetch, calls };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-gsc-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function credentialsFile(content: object, mode = 0o600): string {
  const path = join(dir, "gsc.json");
  writeFileSync(path, JSON.stringify(content));
  chmodSync(path, mode);
  return path;
}

/** A token source handing out TOKEN; records which credential asked. */
function tokens() {
  const asked: GscCredentials[] = [];
  return {
    asked,
    accessToken: async (credentials: GscCredentials) => {
      asked.push(credentials);
      return TOKEN;
    },
  };
}

type Setup = { path?: string; property?: string | null; fetch?: SafeFetch };

function run({ path, property = PROPERTY, fetch = searchConsoleApi().fetch }: Setup) {
  const log: string[] = [];
  const base = crawlContext("https://docs.example.com", { fetch, log: (m) => log.push(m) });
  const product = { ...base.product, searchConsoleProperty: property ?? undefined };
  const config = { ...base.config, HARBOUR_GSC_CREDENTIALS: path };
  const source = tokens();
  const collector = createSearchConsole({ accessToken: source.accessToken });
  const result = collector.collect({ ...base, product, config });
  return { result, log, asked: source.asked };
}

const failure = async (promise: Promise<unknown>) =>
  (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as Error;

const SETUP_GUIDE = 'see "Connect Search Console" in README.md';

describe("search-console collector: not configured", () => {
  it("says how to connect when HARBOUR_GSC_CREDENTIALS is unset", async () => {
    const api = searchConsoleApi();
    const { result, asked } = run({ fetch: api.fetch });
    expect(await result).toEqual({
      status: "not_configured",
      reason:
        "Set HARBOUR_GSC_CREDENTIALS in .env to the path of a Google credentials JSON file " +
        `(mode 600) and restart the worker: ${SETUP_GUIDE}.`,
    });
    expect(api.calls).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("says which product needs a searchConsoleProperty", async () => {
    const path = credentialsFile(AUTHORIZED_USER);
    expect(await run({ path, property: null }).result).toEqual({
      status: "not_configured",
      reason:
        'Add "searchConsoleProperty" to the "acme-docs" product in harbour.config.json, e.g. ' +
        '"sc-domain:example.com" or "https://www.example.com/", and restart the worker.',
    });
  });

  it("says the credentials file is missing", async () => {
    expect(await run({ path: join(dir, "absent.json") }).result).toEqual({
      status: "not_configured",
      reason:
        "HARBOUR_GSC_CREDENTIALS names a file that does not exist: save the Google credentials " +
        `JSON there with mode 600; ${SETUP_GUIDE}.`,
    });
  });
});

describe("search-console collector", () => {
  it("records 28 days by date, the top queries and pages from recorded responses", async () => {
    const api = searchConsoleApi();
    const { result, asked, log } = run({
      path: credentialsFile(AUTHORIZED_USER),
      fetch: api.fetch,
    });
    const outcome = await result;
    expect(asked).toEqual([expect.objectContaining({ type: "authorized_user" })]);
    expect(api.calls.map((c) => c.url)).toEqual([ENDPOINT, ENDPOINT, ENDPOINT]);
    const window = { startDate: "2026-09-01", endDate: "2026-09-28", type: "web" };
    expect(api.calls.map((c) => c.options.post?.json)).toEqual([
      { ...window, dimensions: ["date"], rowLimit: 28 },
      { ...window, dimensions: ["query"], rowLimit: 250 },
      { ...window, dimensions: ["page"], rowLimit: 100 },
    ]);
    for (const { options } of api.calls) {
      expect(options).toMatchObject({
        post: { bearer: TOKEN },
        ignoreRobots: true,
        timeoutMs: 30_000,
        maxBytes: 1024 * 1024,
        onOverflow: "error",
        accept: "application/json",
      });
    }
    if (outcome.status !== "ok") throw new Error(`expected ok, got ${outcome.status}`);
    const of = (kind: string) => outcome.observations.filter((o) => o.kind === kind);
    expect(of("gsc_daily").map((o) => o.subject)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-27",
      "2026-09-28",
    ]);
    expect(of("gsc_daily")[0]?.value).toEqual({
      clicks: 14,
      impressions: 412,
      ctr: 0.03398058252427184,
      position: 18.3,
    });
    expect(of("gsc_query").map((o) => o.subject)).toEqual([
      "acme docs",
      "how to write api docs",
      "docs site generator",
    ]);
    expect(of("gsc_page")[1]).toEqual({
      kind: "gsc_page",
      subject: "https://docs.example.com/guides/api-docs",
      value: { clicks: 27, impressions: 3804, ctr: 0.007097791798107256, position: 11.5 },
    });
    expect(of("gsc_summary")).toEqual([
      {
        kind: "gsc_summary",
        subject: PROPERTY,
        value: {
          startDate: "2026-09-01",
          endDate: "2026-09-28",
          days: 4,
          queries: 3,
          pages: 2,
          warning: null,
        },
      },
    ]);
    expect(log).toEqual(["4 days, 3 queries, 2 pages (2026-09-01 to 2026-09-28)"]);
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
  });

  it("accepts a URL-prefix property, encoded in the request path", async () => {
    const api = searchConsoleApi();
    const property = "https://docs.example.com/";
    await run({ path: credentialsFile(AUTHORIZED_USER), property, fetch: api.fetch }).result;
    expect(api.calls[0]?.url).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fdocs.example.com%2F/searchAnalytics/query",
    );
  });

  it("records no rows as an empty report, not a failure", async () => {
    const api = searchConsoleApi(200, recorded("empty.json"));
    const outcome = await run({ path: credentialsFile(AUTHORIZED_USER), fetch: api.fetch }).result;
    expect(outcome).toEqual({
      status: "ok",
      observations: [
        expect.objectContaining({
          kind: "gsc_summary",
          value: expect.objectContaining({ days: 0 }),
        }),
      ],
    });
  });

  it("runs but warns when other users can read the credentials file", async () => {
    const path = credentialsFile(SERVICE_ACCOUNT, 0o644);
    const { result, log } = run({ path });
    const outcome = await result;
    const warning =
      "The Search Console credentials file has mode 644, so other users can read it: run chmod 600 on it.";
    expect(log[0]).toBe(warning);
    const summary = outcome.status === "ok" ? outcome.observations.at(-1) : undefined;
    expect(summary?.value).toMatchObject({ warning });
  });
});

describe("search-console collector: failures", () => {
  const forbidden = JSON.stringify({
    error: {
      code: 403,
      message: "User does not have sufficient permission for site 'sc-domain:docs.example.com'.",
      errors: [{ reason: "forbidden" }],
    },
  });

  it("asks to share the property with the service account on 403", async () => {
    const api = searchConsoleApi(403, forbidden);
    const error = await failure(
      run({ path: credentialsFile(SERVICE_ACCOUNT), fetch: api.fetch }).result,
    );
    expect(error.message).toBe(
      `Search Console refused access to ${PROPERTY} (HTTP 403): check the property is shared with ` +
        `the credential's account (${SERVICE_ACCOUNT.client_email}). Google said: User does not ` +
        "have sufficient permission for site 'sc-domain:docs.example.com'.",
    );
    expect(api.calls).toHaveLength(1);
  });

  it("names the OAuth user's account on 401", async () => {
    const api = searchConsoleApi(401, "");
    const error = await failure(
      run({ path: credentialsFile(AUTHORIZED_USER), fetch: api.fetch }).result,
    );
    expect(error.message).toBe(
      `Search Console refused access to ${PROPERTY} (HTTP 401): check the property is shared with ` +
        "the credential's account (the Google account that authorised the OAuth client).",
    );
  });

  it("reports a used-up quota", async () => {
    const body = JSON.stringify({
      error: { code: 429, message: "Quota exceeded.", errors: [{ reason: "rateLimitExceeded" }] },
    });
    const api = searchConsoleApi(429, body);
    const error = await failure(
      run({ path: credentialsFile(AUTHORIZED_USER), fetch: api.fetch }).result,
    );
    expect(error.message).toBe(
      "Search Console quota exceeded (HTTP 429): Quota exceeded. Wait for tomorrow's scan.",
    );
  });

  it("fails on a response that is not a Search Analytics report", async () => {
    const api = searchConsoleApi(200, "<html>");
    const error = await failure(
      run({ path: credentialsFile(AUTHORIZED_USER), fetch: api.fetch }).result,
    );
    expect(error.message).toBe("Search Console returned an unexpected response");
  });

  it("fails readably on a timeout, without the token", async () => {
    const fetch: SafeFetch = async (url) => {
      throw new FetchError("timeout", `${url} took longer than 30000 ms`);
    };
    const error = await failure(run({ path: credentialsFile(AUTHORIZED_USER), fetch }).result);
    expect(error.message).toBe("Search Console did not answer within 30 s");
    expect(`${error.message} ${error.stack}`).not.toContain(TOKEN);
  });

  it("fails on an unusable credentials file", async () => {
    const path = credentialsFile({ type: "authorized_user", client_id: "x" });
    const error = await failure(run({ path }).result);
    expect(error.message).toBe(
      'The Search Console credentials file is not a usable "authorized_user" file ' +
        "(missing or invalid: client_secret, refresh_token).",
    );
  });
});
