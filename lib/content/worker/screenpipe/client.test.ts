import { startFakeScreenpipe } from "@/tests/helpers/fake-screenpipe";
import {
  checkHealth,
  describeFailure,
  fetchActivity,
  MAX_RESPONSE_BYTES,
  ScreenpipeError,
} from "./client";

const RANGE = { start: new Date("2026-09-30T14:00:00Z"), end: new Date("2026-10-01T14:00:00Z") };
const SNIPPET = {
  text: "Acme Docs: rewrote the getting-started guide",
  app_name: "Editor",
  window_name: "guide.md",
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
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );
const kindOf = async (promise: Promise<unknown>) => {
  const error = await failure(promise);
  if (error === null) return null;
  return error instanceof ScreenpipeError ? error.kind : "other";
};

describe("fetchActivity", () => {
  it("returns the window list with app, title and minutes, and skips rows it cannot read", async () => {
    const windows = [
      { app_name: "Editor", window_name: "guide.md", minutes: 12.5 },
      { app_name: "Browser", window_name: "Acme Docs - Home", minutes: 3 },
    ];
    await withServer({ windows }, async (url, fake) => {
      const activity = await fetchActivity(settings(url), RANGE, ["acme"]);
      expect(activity.windows).toEqual([
        { app: "Editor", window: "guide.md", minutes: 12.5 },
        { app: "Browser", window: "Acme Docs - Home", minutes: 3 },
      ]);
      expect(fake.requests.find((r) => r.path === "/activity-summary")?.query.include_windows).toBe(
        "true",
      );
    });
    await withServer(
      { windows: [{ app_name: "Editor", window_name: "x", minutes: -4 }, ...windows] },
      async (url) => {
        const activity = await fetchActivity(settings(url), RANGE, ["acme"]);
        expect(activity.windows).toHaveLength(2);
        expect(activity.dropped).toBe(1);
      },
    );
  });

  it("asks for the narrowest call, with the key and fixed client headers, and keeps only what it needs", async () => {
    await withServer({ snippets: [SNIPPET] }, async (url, fake) => {
      const activity = await fetchActivity(settings(url), RANGE, ["acme docs", "acme-docs"]);
      expect(activity).toEqual({
        dataStatus: "ok",
        snippets: [{ app: "Editor", window: "guide.md", text: SNIPPET.text, timestamp: null }],
        windows: [],
        dropped: 0,
      });
      const request = fake.requests.find((r) => r.path === "/activity-summary");
      expect(request?.query).toEqual({
        start_time: "2026-09-30T14:00:00.000Z",
        end_time: "2026-10-01T14:00:00.000Z",
        q: "acme docs acme-docs",
        include_memories: "false",
        include_key_texts: "false",
        include_recording: "false",
        include_guidance: "false",
        include_apps: "false",
        include_windows: "true",
        max_snippets: "30",
        max_snippet_chars: "240",
      });
      expect(request?.headers).toEqual({
        authorization: "Bearer sp-test-key",
        client: "api",
        agent: "harbour",
      });
    });
  });

  it("reports a day with nothing on screen but recording as an empty digest, not a failure", async () => {
    await withServer({ mode: "empty" }, async (url) => {
      expect(await fetchActivity(settings(url), RANGE, ["acme"])).toEqual({
        dataStatus: "empty_but_recording",
        snippets: [],
        windows: [],
        dropped: 0,
      });
    });
  });

  it("treats a snippet with no app or window as an unnamed one, and drops every unknown field", async () => {
    await withServer({ snippets: [{ text: "Acme Docs note" } as never] }, async (url) => {
      const { snippets } = await fetchActivity(settings(url), RANGE, ["acme"]);
      expect(snippets).toEqual([{ app: "", window: "", text: "Acme Docs note", timestamp: null }]);
    });
  });

  it.each([
    ["forbidden", "key-refused"],
    ["not-recording", "not-recording"],
    ["no-capture", "no-capture"],
    ["huge", "too-large"],
    ["garbage", "bad-response"],
    ["bad-json", "bad-response"],
    ["unknown-status", "bad-response"],
    ["hang", "not-running"],
    ["stall", "not-running"],
    ["redirect", "redirected"],
  ] as const)("a %s Screenpipe fails as %s", async (mode, kind) => {
    await withServer({ mode }, async (url) => {
      expect(await kindOf(fetchActivity(settings(url, { timeoutMs: 200 }), RANGE, ["acme"]))).toBe(
        kind,
      );
    });
  });

  it("does not follow a redirect, so the key goes nowhere else", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("{}"));
    await withServer({}, async (url) => {
      await fetchActivity(settings(url, { fetchFn }), RANGE, ["acme"]).catch(() => null);
    });
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("stops reading once the body passes the cap", async () => {
    expect(MAX_RESPONSE_BYTES).toBe(2 * 1024 * 1024);
    await withServer({ mode: "huge" }, async (url) => {
      expect(await kindOf(fetchActivity(settings(url), RANGE, ["acme"]))).toBe("too-large");
    });
  });

  it("fails as not running when nothing listens", async () => {
    expect(await kindOf(fetchActivity(settings("http://127.0.0.1:9"), RANGE, ["acme"]))).toBe(
      "not-running",
    );
  });

  it.each([
    "http://192.168.1.20:3030",
    "https://127.0.0.1:3030",
    "http://localhost.example.com:3030",
    "http://127.0.0.1:3030/",
    "http://127.0.0.1:3030/path",
    "http://owner:secret@127.0.0.1:3030",
    "http://127.0.0.1:80",
    "not a url",
  ])("refuses %s before sending anything, so the key never crosses a network", async (baseUrl) => {
    const fetchFn = vi.fn();
    const result = await kindOf(fetchActivity({ baseUrl, apiKey: "k", fetchFn }, RANGE, ["acme"]));
    expect(result).toBe("other");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await kindOf(checkHealth({ baseUrl, apiKey: "k", fetchFn }))).toBe("other");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("never puts the key in an error, or logs anything", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    try {
      for (const mode of ["forbidden", "garbage", "huge", "hang"] as const) {
        await withServer({ mode }, async (url) => {
          const error = await failure(
            fetchActivity(settings(url, { timeoutMs: 200 }), RANGE, ["acme"]),
          );
          expect(error).toBeInstanceOf(ScreenpipeError);
          const text = `${String(error)} ${(error as Error).stack} ${JSON.stringify(error)}`;
          expect(text).not.toContain("sp-test-key");
          expect(text).not.toContain(url);
        });
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("checkHealth", () => {
  it("passes for a healthy Screenpipe, without sending the key, and fails for an unhealthy or absent one", async () => {
    await withServer({}, async (url, fake) => {
      await checkHealth(settings(url));
      expect(fake.requests[0]?.headers.authorization).toBeUndefined();
    });
    await withServer({ mode: "unhealthy" }, async (url) => {
      expect(await kindOf(checkHealth(settings(url)))).toBe("not-running");
    });
    expect(await kindOf(checkHealth(settings("http://127.0.0.1:9")))).toBe("not-running");
  });
});

describe("describeFailure", () => {
  it("is plain, names the day, and tells the owner what to do about a refused key", () => {
    expect(describeFailure("not-running", "1 October")).toBe(
      "Screenpipe isn't running, so there is no activity digest for 1 October.",
    );
    expect(describeFailure("key-refused", "1 October")).toContain("screenpipe auth token");
    expect(describeFailure("key-refused", "1 October")).toContain("HARBOUR_SCREENPIPE_API_KEY");
  });
});
