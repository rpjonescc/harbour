import { aiBody, backlinksBody, serpBody } from "@/tests/helpers/fake-treg";
import {
  AI_CHATGPT,
  BACKLINKS,
  ceilingHeaderValue,
  ceilingMicroUsd,
  ENDPOINT_IDS,
  SERP_ORGANIC,
} from "./treg-endpoints";

const serpIn = {
  query: "q",
  domain: "docs.example.com",
  location: "Australia",
  languageCode: "en",
};
const aiIn = { question: "q", country: "AU", domain: "docs.example.com", name: "Acme Docs" };

describe("the endpoint table", () => {
  it("pins the provider ids exactly as the spec names them", () => {
    expect(ENDPOINT_IDS).toEqual([
      "serpstat.web.backlinks.summary",
      "dataforseo.google.serp.organic",
      "cloro.ai-search.chatgpt.scrape",
    ]);
    expect([BACKLINKS, SERP_ORGANIC, AI_CHATGPT].map((e) => e.estimateMicroUsd)).toEqual([
      2_500, 6_000, 3_600,
    ]);
  });

  it("prices every ceiling at 1.5 times the estimate and never above US$0.05", () => {
    for (const endpoint of [BACKLINKS, SERP_ORGANIC, AI_CHATGPT]) {
      const ceiling = ceilingMicroUsd(endpoint.estimateMicroUsd);
      expect(ceiling).toBe(Math.round(endpoint.estimateMicroUsd * 1.5));
      expect(ceiling).toBeLessThanOrEqual(50_000);
    }
    expect(ceilingHeaderValue(3_750)).toBe("0.00375");
    expect(ceilingHeaderValue(50_000)).toBe("0.05");
  });
});

describe("backlinks answer", () => {
  it("reads the counts and the misspelled rank, ignoring extra fields", () => {
    expect(BACKLINKS.parse(backlinksBody(), { domain: "x" })).toEqual({
      referringDomains: 4,
      backlinks: 120,
      dofollow: 80,
      rank: 12.5,
    });
  });

  it("gives rank null when absent or null", () => {
    const body = (rank: unknown) => ({
      result: {
        data: {
          referring_domains: 1,
          backlinks: 2,
          dofollow_backlinks: 1,
          sersptat_domain_rank: rank,
        },
      },
    });
    expect(BACKLINKS.parse(body(null), { domain: "x" })?.rank).toBeNull();
    expect(BACKLINKS.parse(body(undefined), { domain: "x" })?.rank).toBeNull();
  });

  it.each([
    [
      "a string count",
      { result: { data: { referring_domains: "4", backlinks: 1, dofollow_backlinks: 1 } } },
    ],
    [
      "a negative count",
      { result: { data: { referring_domains: -1, backlinks: 1, dofollow_backlinks: 1 } } },
    ],
    [
      "a fractional count",
      { result: { data: { referring_domains: 1.5, backlinks: 1, dofollow_backlinks: 1 } } },
    ],
    ["a missing count", { result: { data: { referring_domains: 1, backlinks: 1 } } }],
    ["no data", { result: {} }],
    ["an array", []],
    ["null", null],
  ])("refuses %s", (_name, body) => {
    expect(BACKLINKS.parse(body, { domain: "x" })).toBeNull();
  });
});

describe("search answer", () => {
  it("finds our first organic rank and the top domains", () => {
    expect(SERP_ORGANIC.parse(serpBody(7), serpIn)).toMatchObject({
      position: 7,
      url: "https://docs.example.com/guide",
    });
  });

  it("takes the best rank when we appear twice", () => {
    const body = serpBody(9);
    const item = (rank: number) => ({
      type: "organic",
      rank_group: rank,
      domain: "blog.docs.example.com",
      url: "https://blog.docs.example.com/x",
    });
    body.tasks[0]?.result[0]?.items.splice(3, 0, item(2));
    expect(SERP_ORGANIC.parse(body, serpIn)?.position).toBe(2);
  });

  it("ignores organic results deeper than 30", () => {
    const body = serpBody(null);
    body.tasks[0]?.result[0]?.items.push({
      type: "organic",
      rank_group: 31,
      domain: "docs.example.com",
      url: "https://docs.example.com/deep",
    });
    expect(SERP_ORGANIC.parse(body, serpIn)).toMatchObject({ position: null, url: null });
  });

  it("matches the host, not a lookalike", () => {
    const body = {
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "organic",
                  rank_group: 1,
                  domain: "mydocs.example.com",
                  url: "https://mydocs.example.com/",
                },
                {
                  type: "organic",
                  rank_group: 2,
                  domain: "docs.example.com.evil.net",
                  url: "https://docs.example.com.evil.net/",
                },
              ],
            },
          ],
        },
      ],
    };
    expect(SERP_ORGANIC.parse(body, serpIn)?.position).toBeNull();
  });

  it("fails rather than say 'not found' when an organic result is malformed", () => {
    const body = serpBody(null);
    body.tasks[0]?.result[0]?.items.push({
      type: "organic",
      rank_group: "first",
      domain: "docs.example.com",
    } as never);
    expect(SERP_ORGANIC.parse(body, serpIn)).toBeNull();
  });

  it("does not read non-organic results beyond their type", () => {
    const body = {
      tasks: [{ result: [{ items: [{ type: "ai_overview", rank_group: "x", junk: [1] }] }] }],
    };
    expect(SERP_ORGANIC.parse(body, serpIn)).toMatchObject({ position: null, topDomains: [] });
  });

  it.each([
    ["no tasks", { tasks: [] }],
    ["no result", { tasks: [{ result: [] }] }],
    ["items that are not a list", { tasks: [{ result: [{ items: "none" }] }] }],
    ["a task error code", { tasks: [{ status_code: 40501, result: [{ items: [] }] }] }],
    [
      "too many items",
      { tasks: [{ result: [{ items: Array.from({ length: 201 }, () => ({ type: "x" })) }] }] },
    ],
    ["null", null],
  ])("refuses %s", (_name, body) => {
    expect(SERP_ORGANIC.parse(body, serpIn)).toBeNull();
  });

  it("builds the one-task array with depth 30", () => {
    expect(SERP_ORGANIC.request(serpIn)).toEqual([
      { keyword: "q", location_name: "Australia", language_code: "en", depth: 30 },
    ]);
  });

  it("keeps hostile hosts out of the top domains", () => {
    const body = {
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "organic",
                  rank_group: 1,
                  domain: "bad host\n.example",
                  url: "https://ok.example.net/",
                },
                { type: "organic", rank_group: 2, domain: "<b>x</b>", url: "javascript:alert(1)" },
                {
                  type: "organic",
                  rank_group: 3,
                  domain: "fine.example.net",
                  url: "https://fine.example.net/",
                },
              ],
            },
          ],
        },
      ],
    };
    expect(SERP_ORGANIC.parse(body, serpIn)?.topDomains).toEqual([
      "ok.example.net",
      "fine.example.net",
    ]);
  });
});

describe("AI answer", () => {
  it("reads the text, source hosts and entity count", () => {
    const body = aiBody({
      text: "Hello",
      sources: ["https://www.a.example.org/x", "https://b.example.org/"],
    });
    expect(AI_CHATGPT.parse(body, aiIn)).toEqual({
      text: "Hello",
      sourceHosts: ["a.example.org", "b.example.org"],
      citedDomains: ["a.example.org", "b.example.org"],
      businessesNamed: 2,
    });
  });

  it.each([
    ["no text", { result: { sources: [] } }],
    ["a non-string text", { result: { text: 5 } }],
    ["sources that are not a list", { result: { text: "x", sources: "none" } }],
    [
      "too many sources",
      { result: { text: "x", sources: Array.from({ length: 201 }, () => ({})) } },
    ],
    ["no result", {}],
  ])("refuses %s", (_name, body) => {
    expect(AI_CHATGPT.parse(body, aiIn)).toBeNull();
  });

  it("treats missing sources as none, and skips sources without a usable URL", () => {
    const body = { result: { text: "x", sources: [{ title: "no url" }, { url: "not a url" }] } };
    expect(AI_CHATGPT.parse(body, aiIn)).toMatchObject({ sourceHosts: [], citedDomains: [] });
    expect(AI_CHATGPT.parse({ result: { text: "x" } }, aiIn)).toMatchObject({ citedDomains: [] });
  });

  it("builds the country and prompt body", () => {
    expect(AI_CHATGPT.request(aiIn)).toEqual({ country: "AU", prompt: "q" });
  });
});
