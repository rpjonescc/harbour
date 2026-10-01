import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "@/lib/config";
import { crawlContext as context } from "@/tests/helpers/crawl";
import { applyFieldMask } from "@/tests/helpers/field-mask";
import { DAY, runsOf, setup } from "@/tests/helpers/scan-run";
import { FetchError } from "../fetch-error";
import type { SafeFetch, SafeFetchOptions } from "../types";
import { PSI_FIELDS, pagespeed } from "./pagespeed";

const FIXTURE = join(
  import.meta.dirname,
  "../../../tests/fixtures/pagespeed/runpagespeed-mobile.json",
);
const recorded = readFileSync(FIXTURE, "utf8");
const PRODUCT = "https://docs.example.com";
const KEY = "test-pagespeed-key-123";

type Call = { url: string; options: SafeFetchOptions };

/** A fake fetch answering every call with `body` and `status`; records the calls. */
function answering(body: string, status = 200) {
  const calls: Call[] = [];
  const fetch: SafeFetch = async (url, options) => {
    calls.push({ url, options });
    const base = { url, finalUrl: url, redirects: [], status, headers: {}, headerLines: [] };
    return { ...base, body, truncated: false, ms: 20_000 };
  };
  return { fetch, calls };
}

/** A context with an API key, or with none (`null`). */
function contextWith(fetch: SafeFetch, key: string | null = KEY) {
  const ctx = context(PRODUCT, { fetch });
  return { ...ctx, config: { ...ctx.config, HARBOUR_PAGESPEED_API_KEY: key ?? undefined } };
}

/** The recorded response with `change` applied. */
function variant(change: (json: Record<string, unknown>) => void): string {
  const json = JSON.parse(recorded) as Record<string, unknown>;
  change(json);
  return JSON.stringify(json);
}

const googleError = (code: number, message: string, reason: string) =>
  JSON.stringify({ error: { code, message, errors: [{ message, domain: "global", reason }] } });

describe("pagespeed collector", () => {
  it("records Core Web Vitals from a recorded PageSpeed Insights response", async () => {
    const { fetch, calls } = answering(recorded);
    const result = await pagespeed.collect(contextWith(fetch));
    expect(result).toEqual({
      status: "ok",
      observations: [
        {
          kind: "cwv",
          subject: `${PRODUCT}/`,
          value: {
            performanceScore: 87,
            lcpMs: 2950,
            inpMs: 142,
            cls: 0.0421,
            fcpMs: 1835,
            tbtMs: 181,
            fieldDataAvailable: true,
          },
        },
      ],
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      url: `${PRODUCT}/`,
      strategy: "mobile",
      category: "performance",
      fields: PSI_FIELDS,
      key: KEY,
    });
    expect(calls[0]?.options).toMatchObject({
      ignoreRobots: true,
      timeoutMs: 90_000,
      maxBytes: 1024 * 1024,
      onOverflow: "error",
    });
  });

  it("asks only for the fields it reads: the masked response reads the same", async () => {
    const masked = JSON.stringify(applyFieldMask(JSON.parse(recorded), PSI_FIELDS));
    expect(masked.length).toBeLessThan(recorded.length / 4);
    const full = await pagespeed.collect(contextWith(answering(recorded).fetch));
    const trimmed = await pagespeed.collect(contextWith(answering(masked).fetch));
    expect(trimmed).toEqual(full);
    const failure = variant((json) => {
      const lighthouse = json.lighthouseResult as Record<string, unknown>;
      lighthouse.runtimeError = { code: "NO_FCP", message: "The page did not paint." };
    });
    const maskedFailure = JSON.stringify(applyFieldMask(JSON.parse(failure), PSI_FIELDS));
    await expect(pagespeed.collect(contextWith(answering(maskedFailure).fetch))).rejects.toThrow(
      "(NO_FCP): The page did not paint.",
    );
  });

  it("reports INP as unknown when there is no field data", async () => {
    const body = variant((json) => {
      json.loadingExperience = { initial_url: `${PRODUCT}/` };
      delete json.originLoadingExperience;
    });
    const result = await pagespeed.collect(contextWith(answering(body).fetch));
    const value = result.status === "ok" ? result.observations[0]?.value : null;
    expect(value).toMatchObject({ inpMs: null, fieldDataAvailable: false, performanceScore: 87 });
  });

  it("sends the API key but never stores or reports it", async () => {
    const ok = answering(recorded);
    const result = await pagespeed.collect(contextWith(ok.fetch, KEY));
    expect(new URL(ok.calls[0]?.url ?? "").searchParams.get("key")).toBe(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("fails readably on a timeout, without the request URL or key", async () => {
    const failing: SafeFetch = async (url) => {
      throw new FetchError("timeout", `${url} took longer than 90000 ms`);
    };
    const error = await pagespeed.collect(contextWith(failing, KEY)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const { message, cause, stack } = error as Error;
    expect(message).toBe("PageSpeed Insights did not answer within 90 s");
    expect(`${message} ${stack} ${JSON.stringify(error)}`).not.toContain(KEY);
    expect(cause).toBeUndefined();
  });

  it("says the key's own quota is used up when a key is set", async () => {
    const body = googleError(
      429,
      "Quota exceeded for quota metric 'Queries'.",
      "rateLimitExceeded",
    );
    const run = pagespeed.collect(contextWith(answering(body, 429).fetch, KEY));
    await expect(run).rejects.toThrow(
      "PageSpeed Insights quota exceeded (HTTP 429): Quota exceeded for quota metric 'Queries'. " +
        "The API key's quota is used up: raise it in Google Cloud, or wait for the next weekly run.",
    );
  });

  it("is not configured without an API key, and says how to get one", async () => {
    const { fetch, calls } = answering(recorded);
    expect(await pagespeed.collect(contextWith(fetch, null))).toEqual({
      status: "not_configured",
      reason:
        'PageSpeed Insights needs an API key: in Google Cloud, enable the "PageSpeed Insights API", ' +
        "create an API key restricted to that API, set HARBOUR_PAGESPEED_API_KEY in .env and " +
        "restart the worker.",
    });
    expect(calls).toEqual([]);
  });

  it("redacts the key from Google's own error message", async () => {
    const body = googleError(
      400,
      `API key ${KEY} not valid. Please pass a valid API key.`,
      "badRequest",
    );
    const run = pagespeed.collect(contextWith(answering(body, 400).fetch, KEY));
    await expect(run).rejects.toThrow(
      "PageSpeed Insights answered HTTP 400: API key [redacted] not valid. Please pass a valid API key.",
    );
  });

  it("shortens a long Google message", async () => {
    const body = googleError(500, "e".repeat(1000), "backendError");
    const run = pagespeed.collect(contextWith(answering(body, 500).fetch));
    await expect(run).rejects.toThrow(`PageSpeed Insights answered HTTP 500: ${"e".repeat(300)}…`);
  });

  it("fails when Lighthouse could not load the page", async () => {
    const body = variant((json) => {
      const lighthouse = json.lighthouseResult as Record<string, unknown>;
      lighthouse.runtimeError = {
        code: "FAILED_DOCUMENT_REQUEST",
        message: "Lighthouse was unable to load the page.",
      };
      lighthouse.categories = { performance: { score: null } };
    });
    await expect(pagespeed.collect(contextWith(answering(body).fetch))).rejects.toThrow(
      "Lighthouse could not analyse the page (FAILED_DOCUMENT_REQUEST): Lighthouse was unable to load the page.",
    );
  });

  it("fails on a response that is not a PageSpeed result", async () => {
    await expect(pagespeed.collect(contextWith(answering("<html>").fetch))).rejects.toThrow(
      "PageSpeed Insights returned an unexpected response",
    );
  });
});

describe("pagespeed in a scan", () => {
  it("runs at most weekly: skipped while an ok result is under 7 days old", async () => {
    const { fetch, calls } = answering(recorded);
    const { db, scan, advance } = setup([pagespeed], {
      fetch,
      config: { ...getConfig(), HARBOUR_PAGESPEED_API_KEY: KEY },
      products: [{ id: "acme-docs", name: "Acme Docs", url: PRODUCT, hue: "amber" }],
    });
    await scan();
    advance(3 * DAY);
    await scan();
    expect(runsOf(db)).toEqual([
      { collector: "pagespeed", status: "ok", error: null, items: 1 },
      {
        collector: "pagespeed",
        status: "skipped",
        error: "runs weekly; last ran 2026-10-01",
        items: null,
      },
    ]);
    expect(calls).toHaveLength(1);
  });
});
