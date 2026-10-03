import { readFileSync } from "node:fs";
import {
  CHANNELS,
  INSTAGRAM_ID,
  LINKEDIN_ID,
  POSTIZ_KEY,
  type PostizMode,
  startFakePostiz,
} from "@/tests/helpers/fake-postiz";
import * as client from "./client";
import { buildDraftRequest, createDraft, listChannels, PostizError } from "./client";

const DATE = new Date("2026-10-04T01:00:00Z");
const DRAFT = {
  channelId: LINKEDIN_ID,
  kind: "linkedin-page",
  text: "Hello.\n\n#docs",
  date: DATE,
};

async function withPostiz<T>(
  options: Parameters<typeof startFakePostiz>[0],
  run: (fake: Awaited<ReturnType<typeof startFakePostiz>>) => Promise<T>,
) {
  const fake = await startFakePostiz(options);
  try {
    return await run(fake);
  } finally {
    await fake.close();
  }
}
const settings = (baseUrl: string, apiKey = POSTIZ_KEY) => ({ baseUrl, apiKey, timeoutMs: 1000 });
const caught = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );
const kindOf = async (promise: Promise<unknown>) => {
  const error = await caught(promise);
  return error instanceof PostizError ? error.kind : error === null ? null : "other";
};

describe("buildDraftRequest (spec 11)", () => {
  it("always asks for a draft: the type is fixed in code and is not an argument", () => {
    const request = buildDraftRequest(DRAFT);
    expect(request.type).toBe("draft");
    expect(buildDraftRequest.length).toBe(1);
    // Even a caller that smuggles a type in gets a draft.
    const smuggled = { ...DRAFT, type: "now" } as unknown as typeof DRAFT;
    expect(buildDraftRequest(smuggled).type).toBe("draft");
  });

  it("is the documented create-post body: one channel, the text, no images, no short links", () => {
    expect(buildDraftRequest(DRAFT)).toEqual({
      type: "draft",
      date: "2026-10-04T01:00:00.000Z",
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: LINKEDIN_ID },
          value: [{ content: "Hello.\n\n#docs", image: [] }],
          settings: { __type: "linkedin-page" },
        },
      ],
    });
  });

  it("gives Instagram the post type it requires, and refuses a channel kind it does not know", () => {
    const instagram = buildDraftRequest({ ...DRAFT, channelId: INSTAGRAM_ID, kind: "instagram" });
    expect(instagram.posts[0]?.settings).toEqual({ __type: "instagram", post_type: "post" });
    expect(() => buildDraftRequest({ ...DRAFT, kind: "x" })).toThrow();
    expect(() => buildDraftRequest({ ...DRAFT, kind: "youtube" })).toThrow();
  });

  it("has no way to schedule, publish, update or delete (the module is read for it)", () => {
    expect(Object.keys(client).sort()).toEqual(
      ["PostizError", "buildDraftRequest", "createDraft", "listChannels"].sort(),
    );
    const source = readFileSync("lib/content/worker/postiz/client.ts", "utf8");
    // The only post type literal in the module is "draft".
    const types = [...source.matchAll(/\btype:\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(types).toEqual(["draft"]);
    for (const word of ['"now"', '"schedule"', "'now'", "'schedule'", "`now`", "`schedule`"]) {
      expect(source).not.toContain(word);
    }
    expect(source).not.toMatch(/method:\s*"(DELETE|PUT|PATCH)"/);
    expect(source).not.toMatch(/\/posts\/|change-status|\/upload/);
  });
});

describe("listChannels", () => {
  it("sends the raw key (no Bearer) to the self-hosted public API and keeps only what it needs", async () => {
    await withPostiz({}, async (fake) => {
      const channels = await listChannels(settings(fake.url));
      expect(channels).toHaveLength(CHANNELS.length);
      expect(channels[0]).toEqual({ id: LINKEDIN_ID, kind: "linkedin-page", disabled: false });
      expect(fake.calls).toEqual([
        expect.objectContaining({
          method: "GET",
          path: "/api/public/v1/integrations",
          authorization: POSTIZ_KEY,
        }),
      ]);
    });
  });
});

describe("createDraft", () => {
  it("posts the draft as JSON and returns Postiz's post id", async () => {
    await withPostiz({}, async (fake) => {
      expect(await createDraft(settings(fake.url), DRAFT)).toBe("post-123");
      const call = fake.calls[0];
      expect(call).toMatchObject({
        method: "POST",
        path: "/api/public/v1/posts",
        authorization: POSTIZ_KEY,
        contentType: "application/json",
      });
      expect(JSON.parse(call?.body ?? "")).toEqual(buildDraftRequest(DRAFT));
    });
  });

  it.each<[PostizMode, string]>([
    ["unauthorized", "key-refused"],
    ["forbidden", "key-refused"],
    ["bad-request", "refused"],
    ["rate-limited", "rate-limited"],
    ["server-error", "server-error"],
    ["redirect", "redirected"],
    ["hang", "unreachable"],
    ["huge", "too-large"],
    ["bad-json", "bad-response"],
    ["wrong-shape", "bad-response"],
    ["empty", "bad-response"],
  ])("a %s answer is %s", async (mode, kind) => {
    await withPostiz({ create: mode, list: mode }, async (fake) => {
      expect(await kindOf(createDraft(settings(fake.url), DRAFT))).toBe(kind);
      // An empty channel list is a valid answer (no channels connected yet).
      if (mode !== "empty") expect(await kindOf(listChannels(settings(fake.url)))).toBe(kind);
    });
  });

  it("a Postiz that is not running is unreachable", async () => {
    const fake = await startFakePostiz();
    await fake.close();
    expect(await kindOf(createDraft(settings(fake.url), DRAFT))).toBe("unreachable");
  });

  it("refuses an address off this machine and the tailnet, and a key a header cannot hold, without a request", async () => {
    await withPostiz({}, async (fake) => {
      const off = settings("https://postiz.example.com/api");
      expect(await kindOf(createDraft(off, DRAFT))).toBe("other");
      expect(await kindOf(listChannels(settings(fake.url, "bad\nkey")))).toBe("other");
      expect(fake.calls).toEqual([]);
    });
  });

  it("never puts the key in an error", async () => {
    await withPostiz({ create: "unauthorized" }, async (fake) => {
      const errors = [
        await caught(createDraft(settings(fake.url), DRAFT)),
        await caught(listChannels(settings(fake.url, `${POSTIZ_KEY}\n`))),
        await caught(createDraft(settings("https://postiz.example.com/api"), DRAFT)),
      ];
      for (const error of errors) {
        expect(error).toBeInstanceOf(Error);
        expect(`${String(error)} ${(error as Error).stack ?? ""}`).not.toContain("SENTINEL");
      }
    });
  });
});
