import { backlinksValue, tregSummaryValue } from "@/lib/scan/treg-shapes";
import {
  type Answers,
  DOMAIN,
  type FakeTregOptions,
  fakeTreg,
  KEY,
  observed,
  tregRun,
} from "@/tests/helpers/fake-treg";
import { closeSites } from "@/tests/helpers/http-site";

afterEach(closeSites);

const LIST = "serpstat.web.linking_domains.list";
const TRACKING = { queries: [], questions: ["Who is Acme?"], country: "AU", languageCode: "en" };
const row = (domain_from: string, ref_pages: number) => ({ domain_from, ref_pages });

async function links(answers: Answers, mode?: FakeTregOptions["mode"], product?: { url: string }) {
  const server = await fakeTreg({ answers, mode });
  const run = await tregRun({ origin: server.origin, tracking: TRACKING, product });
  const [found] = observed(run.result, "backlinks");
  return { server, run, value: backlinksValue.parse(found?.value) };
}

describe("backlinks: the site's own domain is not an outside site", () => {
  it("counts nothing when the only linking domain is the site itself", async () => {
    const { value, server } = await links({
      referringDomains: 1,
      backlinks: 4,
      linkingRows: [row(DOMAIN, 4)],
    });
    expect(value).toMatchObject({ referringDomains: 0, backlinks: 0, ownDomainExcluded: true });
    expect(server.calls.map((c) => c.endpoint)).toContain(LIST);
  });

  it("drops the own domain and keeps the outsiders, with their pages", async () => {
    const { value } = await links({
      referringDomains: 3,
      backlinks: 20,
      linkingRows: [row(DOMAIN, 4), row("a.example.org", 10), row("b.example.org", 6)],
    });
    expect(value).toMatchObject({ referringDomains: 2, backlinks: 16, ownDomainExcluded: true });
  });

  it("keeps an all-outside list as it is, and says the own domain was checked", async () => {
    const { value } = await links({
      referringDomains: 2,
      backlinks: 9,
      linkingRows: [row("a.example.org", 5), row("b.example.org", 4)],
    });
    expect(value).toMatchObject({ referringDomains: 2, backlinks: 9, ownDomainExcluded: true });
  });

  it("drops a subdomain and www of the site, never a look-alike", async () => {
    const { value } = await links({
      referringDomains: 5,
      backlinks: 30,
      linkingRows: [
        row(`www.${DOMAIN}`, 3),
        row(`blog.${DOMAIN}`, 2),
        row(`not${DOMAIN}`, 5),
        row(`${DOMAIN}.evil.net`, 6),
        row("a.example.org", 14),
      ],
    });
    expect(value).toMatchObject({ referringDomains: 3, backlinks: 25, ownDomainExcluded: true });
  });

  it("never lets the backlinks go below 0, nor the dofollow past the backlinks", async () => {
    const { value } = await links({
      referringDomains: 2,
      backlinks: 2,
      linkingRows: [row(DOMAIN, 5), row("a.example.org", 0)],
    });
    expect(value).toMatchObject({ referringDomains: 1, backlinks: 0, dofollow: 0 });
  });

  it("makes no list call for a site with more than 25 linking domains", async () => {
    const { value, server } = await links({ referringDomains: 26, backlinks: 100 });
    expect(value).toMatchObject({ referringDomains: 26, backlinks: 100, ownDomainExcluded: false });
    expect(server.calls.map((c) => c.endpoint)).not.toContain(LIST);
  });

  it("asks for the list at exactly 25, and not for none", async () => {
    const at25 = await links({
      referringDomains: 25,
      backlinks: 100,
      linkingRows: Array.from({ length: 25 }, (_, i) => row(`s${i}.example.org`, 4)),
    });
    expect(at25.value).toMatchObject({ referringDomains: 25, ownDomainExcluded: true });
    const none = await links({ referringDomains: 0, backlinks: 0 });
    expect(none.value).toMatchObject({ referringDomains: 0, ownDomainExcluded: true });
    expect(none.server.calls.map((c) => c.endpoint)).not.toContain(LIST);
  });

  it("asks for as many rows as the summary counted, in the pinned request body", async () => {
    const { server } = await links({
      referringDomains: 3,
      backlinks: 5,
      linkingRows: [row("a.example.org", 5)],
    });
    const call = server.calls.find((c) => c.endpoint === LIST);
    expect(call?.json).toEqual({
      method: "SerpstatBacklinksProcedure.getRefDomains",
      id: "1",
      params: { query: DOMAIN, size: 3 },
    });
  });
});

describe("backlinks: the list call goes wrong", () => {
  it.each([
    ["a 5xx", "server_error", "server"],
    ["a 402 over the ceiling", "route_max_cost", "above_ceiling"],
    ["malformed JSON", "malformed", "unreadable"],
    ["an answer of the wrong shape", "wrong_shape", "unreadable"],
    ["an unknown endpoint", "unknown_endpoint", "retired"],
  ] as const)(
    "keeps the summary and notes the problem when it gets %s",
    async (_name, listMode, reason) => {
      const { value, run } = await links({ referringDomains: 3, backlinks: 20 }, (endpoint) =>
        endpoint === LIST ? listMode : "ok",
      );
      expect(value).toMatchObject({ referringDomains: 3, backlinks: 20, ownDomainExcluded: false });
      const summary = tregSummaryValue.parse(observed(run.result, "treg_summary")[0]?.value);
      expect(summary).toMatchObject({ ok: 2, failed: 0, stoppedBy: "done" });
      expect(summary.problems).toEqual([{ check: "backlinks", subject: DOMAIN, reason }]);
    },
  );

  it.each([
    ["no rows", []],
    ["a row that is not readable", [{ domain_from: 5, ref_pages: 1 }]],
  ])("treats %s as unreadable, never as outside", async (_name, rows) => {
    const { value } = await links({
      referringDomains: 1,
      backlinks: 4,
      linkingRows: rows as never,
    });
    expect(value).toMatchObject({ referringDomains: 1, backlinks: 4, ownDomainExcluded: false });
  });

  it("keeps the check and ends the run when the balance runs out on the list call", async () => {
    const { value, run } = await links({ referringDomains: 3, backlinks: 20 }, (endpoint) =>
      endpoint === LIST ? "balance" : "ok",
    );
    expect(value).toMatchObject({ referringDomains: 3, ownDomainExcluded: false });
    const summary = tregSummaryValue.parse(observed(run.result, "treg_summary")[0]?.value);
    expect(summary).toMatchObject({ ok: 1, stoppedBy: "balance" });
  });

  it("keeps the check when the budget refuses the list call", async () => {
    const server = await fakeTreg({ answers: { referringDomains: 3, backlinks: 20 } });
    const run = await tregRun({ origin: server.origin, tracking: TRACKING, allowCalls: 1 });
    const [found] = observed(run.result, "backlinks");
    expect(backlinksValue.parse(found?.value)).toMatchObject({
      referringDomains: 3,
      ownDomainExcluded: false,
    });
    expect(tregSummaryValue.parse(observed(run.result, "treg_summary")[0]?.value).stoppedBy).toBe(
      "budget",
    );
    expect(server.calls.map((c) => c.endpoint)).not.toContain(LIST);
  });
});

describe("backlinks: what the list call costs", () => {
  it("reserves and settles US$0.0005 a row, and sends a ceiling of 1.5 times that", async () => {
    const server = await fakeTreg({
      answers: { referringDomains: 5, backlinks: 20, linkingRows: [row("a.example.org", 20)] },
    });
    const run = await tregRun({ origin: server.origin, tracking: TRACKING });
    // Summary 2,500 µUSD, list 5 rows x 500 = 2,500, one question 3,600 (at 1.55 AUD per USD).
    expect(run.spent.estimates).toEqual([3_875, 3_875, 5_580]);
    expect(run.spent.recorded.map((r) => r.amountMicroAud)).toEqual([3_875, 3_875, 5_580]);
    const list = server.calls.find((c) => c.endpoint === LIST);
    expect(list?.headers["x-treg-route-max-cost"]).toBe("0.00375");
    const summary = tregSummaryValue.parse(observed(run.result, "treg_summary")[0]?.value);
    expect(summary.spentMicroUsd).toBe(2_500 + 2_500 + 3_600);
  });

  it("costs at most US$0.0125 for 25 rows, with a ceiling under US$0.05", async () => {
    const server = await fakeTreg({
      answers: {
        referringDomains: 25,
        backlinks: 100,
        linkingRows: Array.from({ length: 25 }, (_, i) => row(`s${i}.example.org`, 4)),
      },
    });
    const run = await tregRun({ origin: server.origin, tracking: TRACKING });
    const list = server.calls.find((c) => c.endpoint === LIST);
    expect(list?.headers["x-treg-route-max-cost"]).toBe("0.01875");
    expect(run.spent.recorded[1]?.amountMicroAud).toBe(Math.round(12_500 * 1.55));
  });

  it("never lets the key into the check, its problems, the log or the ledger", async () => {
    for (const listMode of ["ok", "server_error", "malformed", "route_max_cost"] as const) {
      const server = await fakeTreg({
        answers: { referringDomains: 3, backlinks: 20 },
        mode: (endpoint) => (endpoint === LIST ? listMode : "ok"),
      });
      const run = await tregRun({ origin: server.origin, tracking: TRACKING });
      expect(JSON.stringify([run.result, run.error?.message, run.log, run.spent])).not.toContain(
        KEY,
      );
    }
  });
});

describe("history written before the own domain was left out", () => {
  const old = {
    referringDomains: 3,
    backlinks: 20,
    dofollow: 10,
    rank: null,
    provider: "serpstat",
    checkedAt: "2026-10-04T06:00:00.000Z",
  };

  it("still parses, as not excluded", () => {
    const parsed = backlinksValue.parse(old);
    expect(parsed.ownDomainExcluded).toBeUndefined();
    expect(backlinksValue.safeParse({ ...old, ownDomainExcluded: "yes" }).success).toBe(false);
  });
});

describe("backlinks: one odd row does not spoil the list", () => {
  const summary = (value: Awaited<ReturnType<typeof links>>["run"]) =>
    tregSummaryValue.parse(observed(value.result, "treg_summary")[0]?.value);

  it("matches a unicode own domain through its punycode form, and keeps a unicode outsider", async () => {
    const { value, server } = await links(
      {
        referringDomains: 3,
        backlinks: 20,
        linkingRows: [
          row("B\u00fccher.example", 6),
          row("caf\u00e9.example.org", 4),
          row("a.example.org", 5),
        ],
      },
      undefined,
      { url: "https://b\u00fccher.example/" },
    );
    expect(value).toMatchObject({ referringDomains: 2, backlinks: 14, ownDomainExcluded: true });
    const list = server.calls.find((c) => c.endpoint === LIST);
    // Asked for the punycode name, the one the site's own URL has.
    expect(JSON.stringify(list?.json)).toContain("xn--bcher-kva.example");
  });

  it.each([
    ["missing", undefined],
    ["a string", "12"],
    ["negative", -4],
    ["fractional", 2.5],
    ["huge", 1e30],
    ["null", null],
  ])("counts a row whose page count is %s as a domain with 0 pages", async (_name, pages) => {
    const { value } = await links({
      referringDomains: 2,
      backlinks: 10,
      linkingRows: [
        { domain_from: "a.example.org", ref_pages: pages as never },
        row("b.example.org", 10),
      ],
    });
    expect(value).toMatchObject({ referringDomains: 2, backlinks: 10, ownDomainExcluded: true });
  });

  it("subtracts nothing for an own row with an odd page count", async () => {
    const { value } = await links({
      referringDomains: 2,
      backlinks: 10,
      linkingRows: [{ domain_from: DOMAIN, ref_pages: "many" as never }, row("b.example.org", 10)],
    });
    expect(value).toMatchObject({ referringDomains: 1, backlinks: 10 });
  });

  it("drops rows that are not a plain host, counts them, and never quotes them", async () => {
    const hostile = [
      { domain_from: 5, ref_pages: 1 },
      { domain_from: null, ref_pages: 1 },
      { domain_from: { a: 1 }, ref_pages: 1 },
      "not an object",
      null,
      row("evil\u202emoc.example", 1),
      row("a\u0000b.example", 1),
      row("zero\u200bwidth.example", 1),
      row("two words.example", 1),
      row("example.org/path", 1),
      row("example.org:8080", 1),
      row("user@example.org", 1),
      row("", 1),
      row("x".repeat(300), 1),
    ];
    const rows = [row("a.example.org", 5), ...hostile];
    const { value, run } = await links({
      referringDomains: 15,
      backlinks: 50,
      linkingRows: rows as never,
    });
    expect(value).toMatchObject({ referringDomains: 1, ownDomainExcluded: true });
    const tally = summary(run);
    expect(tally.problems).toEqual([
      { check: "backlinks", subject: `${DOMAIN} (14)`, reason: "rows_dropped" },
    ]);
    expect(tally).toMatchObject({ ok: 2, failed: 0 });
    expect(JSON.stringify(tally)).not.toMatch(/evil|zero|words|8080|user@/);
  });

  it("counts a domain once, whatever the case and www, adding its pages", async () => {
    const { value } = await links({
      referringDomains: 4,
      backlinks: 20,
      linkingRows: [
        row("a.example.org", 5),
        row("A.Example.ORG", 5),
        row("www.a.example.org", 5),
        row("b.example.org", 5),
      ],
    });
    expect(value).toMatchObject({ referringDomains: 2, backlinks: 20 });
  });

  it("uses only the rows that were asked for", async () => {
    const { value } = await links({
      referringDomains: 2,
      backlinks: 20,
      linkingRows: [
        row("a.example.org", 5),
        row("b.example.org", 5),
        row("c.example.org", 5),
        row(DOMAIN, 5),
      ],
    });
    expect(value).toMatchObject({ referringDomains: 2, ownDomainExcluded: true });
  });

  it("falls back to the summary, noting unreadable, when every row is junk", async () => {
    const { value, run } = await links({
      referringDomains: 2,
      backlinks: 9,
      linkingRows: [{ domain_from: 1, ref_pages: 1 }, row("evil\u202e.example", 1)] as never,
    });
    expect(value).toMatchObject({ referringDomains: 2, backlinks: 9, ownDomainExcluded: false });
    expect(summary(run).problems).toEqual([
      { check: "backlinks", subject: DOMAIN, reason: "unreadable" },
    ]);
  });
});
