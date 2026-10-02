import { startFakeScreenpipe } from "@/tests/helpers/fake-screenpipe";
import { fetchSearch, ScreenpipeError } from "./client";
import { MAX_HIT_CHARS } from "./schema";

const RANGE = { start: new Date("2026-09-30T14:00:00Z"), end: new Date("2026-10-01T14:00:00Z") };
const HIT = {
  text: "Acme Docs: rewrote the getting-started guide",
  timestamp: "2026-10-01T09:30:00Z",
};

async function withServer<T>(
  options: Parameters<typeof startFakeScreenpipe>[0],
  run: (url: string, fake: Awaited<ReturnType<typeof startFakeScreenpipe>>) => Promise<T>,
) {
  const fake = await startFakeScreenpipe(options);
  try {
    return await run(fake.url, fake);
  } finally {
    await fake.close();
  }
}
const settings = (baseUrl: string, extra = {}) => ({
  baseUrl,
  apiKey: "sp-test-key",
  timeoutMs: 1000,
  ...extra,
});
const kindOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof ScreenpipeError ? error.kind : "other"),
  );

describe("fetchSearch", () => {
  it("asks for one term of OCR text, first page only, with the key and fixed client headers", async () => {
    await withServer({ hits: [HIT] }, async (url, fake) => {
      const result = await fetchSearch(settings(url), RANGE, " acme docs ");
      expect(result).toEqual({
        hits: [{ text: HIT.text, timestamp: HIT.timestamp, app: "", window: "" }],
        dropped: 0,
      });
      const request = fake.requests.find((r) => r.path === "/search");
      expect(request?.query).toEqual({
        content_type: "ocr",
        q: "acme docs",
        start_time: "2026-09-30T14:00:00.000Z",
        end_time: "2026-10-01T14:00:00.000Z",
        limit: "25",
        offset: "0",
      });
      expect(request?.headers).toEqual({
        authorization: "Bearer sp-test-key",
        client: "api",
        agent: "harbour",
      });
    });
  });

  it("keeps app and window names when a Screenpipe version sends them", async () => {
    const hits = [{ ...HIT, app_name: "Editor", window_name: "guide.md" }];
    await withServer({ hits }, async (url) => {
      expect((await fetchSearch(settings(url), RANGE, "acme")).hits[0]).toMatchObject({
        app: "Editor",
        window: "guide.md",
      });
    });
  });

  it("reads an empty answer as no hits", async () => {
    await withServer({ searchMode: "empty" }, async (url) => {
      expect(await fetchSearch(settings(url), RANGE, "acme")).toEqual({ hits: [], dropped: 0 });
    });
  });

  it("drops a row over the size cap and counts it, without failing the call", async () => {
    const hits = [
      HIT,
      { text: "x".repeat(MAX_HIT_CHARS + 1) },
      { text: "y".repeat(MAX_HIT_CHARS) },
    ];
    await withServer({ hits }, async (url) => {
      const result = await fetchSearch(settings(url), RANGE, "acme");
      expect(result.hits.map((h) => h.text.length)).toEqual([HIT.text.length, MAX_HIT_CHARS]);
      expect(result.dropped).toBe(1);
    });
  });

  it("skips items with no content, a wrong type or wrong field types, and ignores the claimed total", async () => {
    const searchItems = [
      { type: "OCR" },
      { type: "OCR", content: null },
      { type: "OCR", content: { text: 42 } },
      { type: "Audio", content: { text: "Acme Docs spoken words" } },
      { type: "ocr", content: { text: "Acme Docs lower-case type", extra: { deep: [1] } } },
      "not an object",
      null,
    ];
    await withServer({ searchItems, searchTotal: 9_999_999_999 }, async (url, fake) => {
      const result = await fetchSearch(settings(url), RANGE, "acme");
      expect(result.hits.map((h) => h.text)).toEqual(["Acme Docs lower-case type"]);
      expect(result.dropped).toBe(6);
      expect(fake.requests.filter((r) => r.path === "/search")).toHaveLength(1);
    });
  });

  it("reads no more than the limit it asked for", async () => {
    const hits = Array.from({ length: 80 }, (_, i) => ({ text: `Acme Docs ${i}` }));
    await withServer({ hits }, async (url) => {
      expect((await fetchSearch(settings(url), RANGE, "acme")).hits).toHaveLength(25);
    });
  });

  it.each([
    ["forbidden", "key-refused"],
    ["huge", "too-large"],
    ["garbage", "bad-response"],
    ["bad-json", "bad-response"],
    ["hang", "not-running"],
    ["stall", "not-running"],
    ["redirect", "redirected"],
  ] as const)("a %s /search fails as %s", async (searchMode, kind) => {
    await withServer({ searchMode }, async (url) => {
      expect(await kindOf(fetchSearch(settings(url, { timeoutMs: 200 }), RANGE, "acme"))).toBe(
        kind,
      );
    });
  });

  it("refuses an empty term and a non-loopback server before sending anything", async () => {
    const fetchFn = vi.fn();
    expect(
      await kindOf(fetchSearch(settings("http://127.0.0.1:9", { fetchFn }), RANGE, "  ")),
    ).toBe("other");
    expect(
      await kindOf(
        fetchSearch({ baseUrl: "http://192.168.1.20:3030", apiKey: "k", fetchFn }, RANGE, "a"),
      ),
    ).toBe("other");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("never puts the key in an error", async () => {
    for (const searchMode of ["forbidden", "garbage", "hang"] as const) {
      await withServer({ searchMode }, async (url) => {
        const error = await fetchSearch(settings(url, { timeoutMs: 200 }), RANGE, "acme").catch(
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(ScreenpipeError);
        expect(`${String(error)} ${(error as Error).stack}`).not.toMatch(
          /sp-test-key|127\.0\.0\.1/,
        );
      });
    }
  });

  it("does not follow a redirect", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("{}"));
    await withServer({}, async (url) => {
      await fetchSearch(settings(url, { fetchFn }), RANGE, "acme").catch(() => null);
    });
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });
});
