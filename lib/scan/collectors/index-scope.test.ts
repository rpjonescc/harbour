import { INDEXING_REASONS } from "@/lib/explain/indexing";
import {
  ANSWERS,
  cleanCredentials,
  indexingRun,
  inspectionApi,
  ORIGIN,
  observed,
} from "@/tests/helpers/url-inspection";
import { pagesInScope } from "./index-plan";

afterEach(cleanCredentials);

describe("pagesInScope", () => {
  it("covers the apex and its subdomains for a domain property, case-insensitively", () => {
    const urls = [
      "https://example.com/a",
      "http://www.example.com/b",
      "https://docs.EXAMPLE.com/c",
      "https://example.com:8443/d",
    ];
    expect(pagesInScope(urls, "sc-domain:example.com")).toEqual(urls);
    expect(pagesInScope(urls, "sc-domain:Example.com")).toEqual(urls);
  });

  it("does not treat a lookalike host as a subdomain", () => {
    const urls = [
      "https://evilexample.com/a",
      "https://example.com.evil.test/b",
      "https://notexample.com/",
    ];
    expect(pagesInScope(urls, "sc-domain:example.com")).toEqual([]);
  });

  it("separates www from the apex for a URL-prefix property", () => {
    const urls = ["https://www.example.com/a", "https://example.com/b", "http://www.example.com/c"];
    expect(pagesInScope(urls, "https://www.example.com/")).toEqual(["https://www.example.com/a"]);
    expect(pagesInScope(urls, "https://example.com/")).toEqual(["https://example.com/b"]);
  });

  it("limits a URL-prefix property with a path to that path", () => {
    const urls = [
      "https://example.com/blog/",
      "https://example.com/blog/post",
      "https://example.com/blogger",
      "https://example.com/other",
    ];
    expect(pagesInScope(urls, "https://example.com/blog/")).toEqual([
      "https://example.com/blog/",
      "https://example.com/blog/post",
    ]);
  });

  it("covers nothing for a property it cannot read", () => {
    expect(pagesInScope(["https://example.com/"], "not a property")).toEqual([]);
  });
});

describe("indexing collector: property scope", () => {
  it("is not configured, with a fixed sentence and no requests, when no page is in scope", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const { result } = await indexingRun({
      fetch: api.fetch,
      urls: [`${ORIGIN}/a`, `${ORIGIN}/b`],
      property: "https://www.example.com/",
    });
    expect(result).toEqual({ status: "not_configured", reason: INDEXING_REASONS.notCovered });
    expect(result.status === "not_configured" && result.reason).toContain(
      "Use the domain property",
    );
    expect(api.calls).toEqual([]);
  });

  it("checks and counts only the pages in scope, and says how many it left out", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const urls = [
      `${ORIGIN}/a`,
      "https://other.example.net/x",
      `${ORIGIN}/b`,
      "https://evildocs.example.com/y",
    ];
    const { result, log } = await indexingRun({
      fetch: api.fetch,
      urls,
      property: "sc-domain:docs.example.com",
    });
    expect(api.calls.map((c) => c.inspected)).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`]);
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({ inspected: 2, total: 2 });
    expect(log).toContain(
      "2 sitemap pages are outside the Search Console property and were not checked",
    );
  });

  it("still fails with the access message for a 403 on an in-scope page", async () => {
    const api = inspectionApi(() => ({ status: 403, body: "{}" }));
    await expect(indexingRun({ fetch: api.fetch })).rejects.toThrow(/refused access/);
  });
});
