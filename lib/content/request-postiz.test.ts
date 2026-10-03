import { auditLog } from "@/lib/db/schema";
import { POSTIZ_REFUSALS } from "@/lib/explain/postiz";
import { claimNextJob, enqueueJob, finishJob, listJobs } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { seedPieces } from "@/tests/helpers/chain";
import { ACME } from "@/tests/helpers/content";
import { openTestDb } from "@/tests/helpers/db";
import { APPROVED, CHANNELS, IDEA, pieceId } from "@/tests/helpers/postiz";
import { NOT_ASKED } from "./postiz/limits";
import { ContentBody, requestContent } from "./request";

const KEY = "SENTINEL-postiz-request-key";
const config = {
  HARBOUR_CONTENT: "on",
  HARBOUR_TIMEZONE: "Australia/Brisbane",
  HARBOUR_LOCALE: "en-GB",
  HARBOUR_CONTENT_DAILY_RUNS: 24,
  HARBOUR_POSTIZ_URL: "http://127.0.0.1:4007/api",
  HARBOUR_POSTIZ_API_KEY: KEY,
};
const NOW = new Date("2026-10-04T02:00:00Z");
const send = (over: Record<string, unknown> = {}) =>
  ContentBody.parse({ action: "send-to-postiz", pieceId: pieceId(), revision: 1, ...over });

function setup(over: Record<string, unknown> = APPROVED, extra: Record<string, unknown> = {}) {
  const brain = makeBrain(seedPieces(IDEA, over));
  const ctx = {
    db: openTestDb(),
    config: { ...config, ...extra } as never,
    login: "owner@example.com",
    now: NOW,
    root: brain.root,
    products: [ACME],
    postizChannels: CHANNELS,
  };
  return { ctx, cleanup: brain.cleanup };
}
function withSetup<T>(run: (s: ReturnType<typeof setup>) => T, ...args: Parameters<typeof setup>) {
  const s = setup(...args);
  try {
    return run(s);
  } finally {
    s.cleanup();
  }
}

describe("requestContent: send-to-postiz (spec 11)", () => {
  it("queues one send for an approved piece, audits it once, and a double click returns the same job", () =>
    withSetup(({ ctx }) => {
      const a = requestContent(ctx, send());
      const b = requestContent(ctx, send());
      expect(a).toMatchObject({ ok: true });
      expect(b).toEqual(a);
      expect(listJobs(ctx.db).map((j) => [j.kind, j.params])).toEqual([
        ["content-postiz", { pieceId: pieceId(), revision: "1" }],
      ]);
      const audits = ctx.db.select().from(auditLog).all();
      expect(audits.map((e) => [e.event, e.detail])).toEqual([
        ["content_run_requested", { kind: "content-postiz", pieceId: pieceId(), resend: false }],
      ]);
      expect(JSON.stringify(audits)).not.toContain(KEY);
    }));

  it.each([
    ["content is off", APPROVED, { HARBOUR_CONTENT: "off" }, {}, "content_off"],
    [
      "Postiz is not set up",
      APPROVED,
      { HARBOUR_POSTIZ_URL: undefined, HARBOUR_POSTIZ_API_KEY: undefined },
      {},
      "postiz_off",
    ],
    ["the piece is only ready", { ...APPROVED, state: "ready" }, {}, {}, "not_approved"],
    ["the revision is old", APPROVED, {}, { revision: 2 }, "stale"],
    ["it is an X piece", APPROVED, {}, { pieceId: pieceId("x") }, "not_supported"],
    ["it is a blog post", APPROVED, {}, { pieceId: pieceId("blog") }, "not_supported"],
    [
      "the piece does not exist",
      APPROVED,
      {},
      { pieceId: "acme-docs-20261001-gone.linkedin" },
      "not_found",
    ],
  ])("refuses when %s and queues nothing", (_label, over, extra, body, error) =>
    withSetup(
      ({ ctx }) => {
        expect(requestContent(ctx, send(body))).toMatchObject({ ok: false, error });
        expect(listJobs(ctx.db)).toEqual([]);
      },
      over,
      extra,
    ),
  );

  it("refuses a platform with no channel set, naming the platform", () =>
    withSetup(({ ctx }) => {
      const result = requestContent({ ...ctx, postizChannels: {} }, send());
      expect(result).toMatchObject({
        ok: false,
        error: "no_channel",
        message: POSTIZ_REFUSALS.noChannel("LinkedIn"),
      });
    }));

  it("asks first when the piece was already sent, and queues a resend only when asked", () =>
    withSetup(
      ({ ctx }) => {
        expect(requestContent(ctx, send())).toMatchObject({
          ok: false,
          error: "confirm_resend",
          message: "You sent this to Postiz on 3 Oct 2026, 11:00. Send it again as a second draft?",
        });
        expect(requestContent(ctx, send({ resend: true }))).toMatchObject({ ok: true });
        expect(listJobs(ctx.db)[0]?.params).toEqual({
          pieceId: pieceId(),
          revision: "1",
          resend: "1",
        });
      },
      { ...APPROVED, postiz: { sentAt: "2026-10-03T01:00:00.000Z", postId: "post-1" } },
    ));

  it("sends one piece at a time", () =>
    withSetup(({ ctx }) => {
      requestContent(ctx, send({ pieceId: pieceId("facebook") }));
      expect(requestContent(ctx, send())).toMatchObject({
        ok: false,
        status: 429,
        error: "postiz_busy",
      });
    }));

  it("allows five sends in an hour; one that asked Postiz nothing does not count", () =>
    withSetup(({ ctx }) => {
      const started = (minutesAgo: number, result: string | null = null) => {
        const at = new Date(NOW.getTime() - minutesAgo * 60_000);
        const { id } = enqueueJob(ctx.db, "content-postiz", { n: String(minutesAgo) }, null, at);
        claimNextJob(ctx.db, at);
        finishJob(ctx.db, id, "ok", null, at, result);
      };
      for (const minutes of [10, 20, 30, 40]) started(minutes);
      started(5, NOT_ASKED);
      started(70); // over an hour ago
      expect(requestContent(ctx, send())).toMatchObject({ ok: true });
      const busy = listJobs(ctx.db).find((j) => j.params.pieceId === pieceId());
      if (busy) {
        claimNextJob(ctx.db, NOW);
        finishJob(ctx.db, busy.id, "ok", null, NOW);
      }
      expect(requestContent(ctx, send({ pieceId: pieceId("facebook") }))).toMatchObject({
        ok: false,
        status: 429,
        error: "rate_limited",
        message: POSTIZ_REFUSALS.rate,
      });
    }));
});
