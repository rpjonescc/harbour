import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHANNEL_PROBLEMS, POSTIZ_REFUSALS, postizFailure } from "@/lib/explain/postiz";
import { eventsSince } from "@/lib/jobs/queue";
import { dumpDb, searchEverywhere } from "@/tests/helpers/content";
import { readPieceAt } from "@/tests/helpers/decision";
import {
  INSTAGRAM_ID,
  LINKEDIN_ID,
  CHANNELS as POSTIZ_CHANNELS,
  POSTIZ_KEY,
  startFakePostiz,
} from "@/tests/helpers/fake-postiz";
import { APPROVED, pieceId, piecePath, postizSetup } from "@/tests/helpers/postiz";

type Fake = Awaited<ReturnType<typeof startFakePostiz>>;
const fakes: Fake[] = [];
const setups: ReturnType<typeof postizSetup>[] = [];
async function fake(options: Parameters<typeof startFakePostiz>[0] = {}) {
  const f = await startFakePostiz(options);
  fakes.push(f);
  return f;
}
function setup(over?: Record<string, unknown>) {
  const s = postizSetup(over);
  setups.push(s);
  return s;
}
afterEach(async () => {
  for (const f of fakes.splice(0)) await f.close();
  for (const s of setups.splice(0)) s.brain.cleanup();
});

const linkedin = { pieceId: pieceId("linkedin"), revision: "1" };
const posted = (f: Fake) => f.calls.filter((c) => c.method === "POST");
const texts = (s: ReturnType<typeof postizSetup>, id: number) =>
  eventsSince(s.db, id, 0).map((e) => e.text);

describe("runPostizJob (spec 11)", () => {
  it("sends an approved LinkedIn piece as a draft, notes it on the piece and commits that file", async () => {
    const s = setup();
    const f = await fake();
    const { job, result } = await s.send(f.url, linkedin);
    expect(job.status).toBe("ok");
    expect(result.pushed).toBe(true);
    expect(f.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/public/v1/integrations",
      "POST /api/public/v1/posts",
    ]);
    expect(JSON.parse(posted(f)[0]?.body ?? "")).toEqual({
      type: "draft",
      date: "2026-10-04T01:00:00.000Z",
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: LINKEDIN_ID },
          value: [{ content: "Docs that ship in five minutes.\n\n#docs", image: [] }],
          settings: { __type: "linkedin-page" },
        },
      ],
    });
    const piece = readPieceAt(s.brain.root, piecePath("linkedin"));
    expect(piece.front).toMatchObject({
      state: "approved",
      revision: 2,
      postiz: { sentAt: "2026-10-04T01:00:00.000Z", postId: "post-123" },
    });
    expect(s.brain.git("log", "-1", "--format=%s").trim()).toBe(
      `content: postiz draft ${pieceId("linkedin")}`,
    );
    expect(s.brain.git("status", "--porcelain")).toBe("");
    expect(texts(s, job.id)).toEqual([
      "Postiz saved the draft (post post-123).",
      "Committed 1 file(s)",
    ]);
  });

  it("sends Instagram's caption and hashtags with the post type Postiz needs, and no visual brief", async () => {
    const s = setup();
    const f = await fake();
    const { job } = await s.send(f.url, { pieceId: pieceId("instagram"), revision: "1" });
    expect(job.status).toBe("ok");
    const post = JSON.parse(posted(f)[0]?.body ?? "").posts[0];
    expect(post).toEqual({
      integration: { id: INSTAGRAM_ID },
      value: [{ content: "Five minutes to a first deploy.\n\n#taga #tagb #tagc", image: [] }],
      settings: { __type: "instagram-standalone", post_type: "post" },
    });
  });

  it.each([
    ["a piece that is not approved", { ...APPROVED, state: "ready" }, linkedin, "notApproved"],
    ["an older revision", APPROVED, { ...linkedin, revision: "2" }, "stale"],
    ["an X piece", APPROVED, { pieceId: pieceId("x"), revision: "1" }, "notSupported"],
    ["a blog post", APPROVED, { pieceId: pieceId("blog"), revision: "1" }, "notSupported"],
    [
      "a piece that does not exist",
      APPROVED,
      { pieceId: "acme-docs-20261001-gone.linkedin", revision: "1" },
      "notFound",
    ],
  ] as const)("refuses %s before asking Postiz anything", async (_label, over, params, key) => {
    const s = setup(over);
    const f = await fake();
    const { job } = await s.send(f.url, params);
    expect(job).toMatchObject({ status: "failed", error: POSTIZ_REFUSALS[key] });
    expect(f.calls).toEqual([]);
  });

  it("refuses when content is off, Postiz isn't connected or the platform has no channel", async () => {
    const s = setup();
    const f = await fake();
    expect((await s.send(f.url, linkedin, { enabled: false })).job.error).toBe(POSTIZ_REFUSALS.off);
    expect((await s.send(null, linkedin)).job.error).toBe(POSTIZ_REFUSALS.notConnected);
    const noChannel = await s.send(
      f.url,
      { pieceId: pieceId("facebook"), revision: "1" },
      {
        channels: { linkedin: LINKEDIN_ID },
      },
    );
    expect(noChannel.job.error).toBe(POSTIZ_REFUSALS.noChannel("Facebook"));
    expect(f.calls).toEqual([]);
  });

  it("asks first before a second draft: without resend it is refused, with it a second draft is made", async () => {
    const s = setup({
      ...APPROVED,
      postiz: { sentAt: "2026-10-03T01:00:00.000Z", postId: "post-1" },
    });
    const f = await fake();
    const once = await s.send(f.url, linkedin);
    expect(once.job.error).toBe(POSTIZ_REFUSALS.alreadySent);
    expect(f.calls).toEqual([]);
    const again = await s.send(f.url, { ...linkedin, resend: "1" });
    expect(again.job.status).toBe("ok");
    expect(readPieceAt(s.brain.root, piecePath("linkedin")).front.postiz?.postId).toBe("post-123");
  });

  it.each([
    [
      "missing from Postiz",
      POSTIZ_CHANNELS.filter((c) => (c as { id: string }).id !== LINKEDIN_ID),
      CHANNEL_PROBLEMS.missing("LinkedIn"),
    ],
    [
      "switched off in Postiz",
      POSTIZ_CHANNELS.map((c) => ({ ...(c as object), disabled: true })),
      CHANNEL_PROBLEMS.disabled("LinkedIn"),
    ],
    [
      "another kind of account",
      POSTIZ_CHANNELS.map((c) => ({ ...(c as object), identifier: "x" })),
      CHANNEL_PROBLEMS.wrongKind("LinkedIn"),
    ],
  ])("stops when the channel is %s, and makes no draft", async (_label, channels, sentence) => {
    const s = setup();
    const f = await fake({ channels });
    const { job } = await s.send(f.url, linkedin);
    expect(job).toMatchObject({ status: "failed", error: sentence });
    expect(posted(f)).toEqual([]);
  });

  it("fails plainly when Postiz is down or refuses, and the piece stays approved and untouched", async () => {
    const s = setup();
    const down = await fake();
    await down.close();
    const cases = [
      [down.url, postizFailure("unreachable", "channels")],
      [(await fake({ list: "unauthorized" })).url, postizFailure("key-refused", "channels")],
      [(await fake({ create: "bad-request" })).url, postizFailure("refused", "draft")],
      [(await fake({ create: "rate-limited" })).url, postizFailure("rate-limited", "draft")],
      [(await fake({ create: "server-error" })).url, postizFailure("server-error", "draft")],
      [(await fake({ create: "redirect" })).url, postizFailure("redirected", "draft")],
    ] as const;
    for (const [url, sentence] of cases) {
      s.later(15); // under the hourly cap: every one of these asked Postiz
      const { job } = await s.send(url, linkedin);
      expect(job).toMatchObject({ status: "failed", error: sentence });
    }
    expect(postizFailure("server-error", "draft")).toMatch(/couldn't tell whether/);
    const piece = readPieceAt(s.brain.root, piecePath("linkedin"));
    expect(piece.front).toMatchObject({ state: "approved", revision: 1, postiz: null });
    expect(s.brain.git("log", "--format=%s")).not.toContain("postiz");
  });

  it("sends at most five drafts in any hour, one at a time, and counts the hour from when each started", async () => {
    const s = setup();
    const f = await fake();
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await s.send(f.url, {
            ...linkedin,
            revision: String(i + 1),
            ...(i ? { resend: "1" } : {}),
          })
        ).job.status,
      ).toBe("ok");
      s.later(5);
    }
    const sixth = await s.send(f.url, { ...linkedin, revision: "6", resend: "1" });
    expect(sixth.job.error).toBe(POSTIZ_REFUSALS.rate);
    expect(posted(f)).toHaveLength(5);
    s.later(40);
    expect((await s.send(f.url, { ...linkedin, revision: "6", resend: "1" })).job.status).toBe(
      "ok",
    );
  });

  it("sends nothing while the owner has unsaved changes to the piece", async () => {
    const s = setup();
    const f = await fake();
    writeFileSync(join(s.brain.root, piecePath("linkedin")), "owner was here\n", { flag: "a" });
    const { job } = await s.send(f.url, linkedin);
    expect(job.error).toBe(POSTIZ_REFUSALS.unsaved);
    expect(f.calls).toEqual([]);
  });

  it("says Postiz has the draft when the note can't be committed, naming the post", async () => {
    const s = setup();
    const f = await fake();
    writeFileSync(join(s.brain.root, ".git", "index.lock"), "");
    const { job } = await s.send(f.url, linkedin);
    expect(job.status).toBe("failed");
    expect(job.error).toContain("post-123");
    expect(job.error).toContain("second draft");
  });

  it("never writes the key anywhere: database, events, brain or logs", async () => {
    const s = setup();
    const logs: string[] = [];
    const spies = (["log", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args) => {
        logs.push(args.map(String).join(" "));
      }),
    );
    try {
      for (const mode of ["ok", "unauthorized", "server-error", "redirect", "bad-json"] as const) {
        const f = await fake({ create: mode });
        await s.send(f.url, { ...linkedin, revision: mode === "ok" ? "1" : "2", resend: "1" });
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(dumpDb(s.db)).not.toContain(POSTIZ_KEY);
    expect(searchEverywhere(POSTIZ_KEY, [s.brain.root, s.brain.remote], logs)).toEqual([]);
  });
});
