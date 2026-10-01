import { postJson } from "./client-api";

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJson", () => {
  it("returns the parsed body for a 2xx JSON response", async () => {
    stubFetch(async () => Response.json({ ok: true, url: "/setup?t=x" }));
    expect(await postJson("/api/x")).toEqual({ ok: true, data: { ok: true, url: "/setup?t=x" } });
  });

  it("returns the server's error code for a JSON error response", async () => {
    stubFetch(async () => Response.json({ error: "unauthenticated" }, { status: 401 }));
    expect(await postJson("/api/x")).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("treats a redirected response as a bad response", async () => {
    stubFetch(async () => {
      const response = Response.json({ ok: true });
      Object.defineProperty(response, "redirected", { value: true });
      return response;
    });
    expect(await postJson("/api/x")).toEqual({ ok: false, error: "bad_response" });
  });

  it("treats a 200 HTML page as a bad response", async () => {
    stubFetch(
      async () =>
        new Response("<!doctype html><title>Sign in</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    expect(await postJson("/api/x")).toEqual({ ok: false, error: "bad_response" });
  });

  it("reports a network failure", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await postJson("/api/x")).toEqual({ ok: false, error: "network_error" });
  });
});
