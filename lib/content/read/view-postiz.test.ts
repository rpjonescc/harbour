import { claimNextJob, enqueueJob, finishJob } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { seedPieces } from "@/tests/helpers/chain";
import { ACME } from "@/tests/helpers/content";
import { openTestDb } from "@/tests/helpers/db";
import { APPROVED, IDEA, pieceId } from "@/tests/helpers/postiz";
import { contentView } from "./view";

const NOW = { today: "2026-10-04", tokenSet: true };
const postiz = {
  platforms: ["linkedin", "instagram"] as const,
  when: (iso: string) => `at ${iso}`,
};

function view(over: Record<string, unknown>, db = openTestDb(), withPostiz = true) {
  const { root, cleanup } = makeBrain(seedPieces(IDEA, over));
  try {
    const v = contentView({
      db,
      root,
      products: [ACME],
      ...NOW,
      ...(withPostiz ? { postiz } : {}),
    });
    return (platform: string) => v.ideas[0]?.pieces.find((p) => p.platform === platform);
  } finally {
    cleanup();
  }
}

describe("contentView: Send to Postiz (spec 11)", () => {
  it("is offered only on an approved piece of a platform with a channel, and only when Postiz is set up", () => {
    const piece = view(APPROVED);
    expect(piece("linkedin")?.postiz).toEqual({ sentAt: null, sending: false, error: null });
    expect(piece("facebook")?.postiz).toBeNull(); // no channel
    expect(piece("x")?.postiz).toBeNull();
    expect(piece("blog")?.postiz).toBeNull();
    expect(view({ ...APPROVED, state: "ready" })("linkedin")?.postiz).toBeNull();
    expect(view(APPROVED, openTestDb(), false)("linkedin")?.postiz).toBeNull();
  });

  it("says when it was sent, while a send waits, and why the newest send of this revision failed", () => {
    const sentAt = "2026-10-03T01:00:00.000Z";
    expect(
      view({ ...APPROVED, postiz: { sentAt, postId: "post-1" } })("linkedin")?.postiz?.sentAt,
    ).toBe(`at ${sentAt}`);
    const db = openTestDb();
    enqueueJob(db, "content-postiz", { pieceId: pieceId(), revision: "1" }, null);
    expect(view(APPROVED, db)("linkedin")?.postiz?.sending).toBe(true);
    const job = claimNextJob(db);
    if (job) finishJob(db, job.id, "failed", "Harbour couldn't reach Postiz.", new Date());
    expect(view(APPROVED, db)("linkedin")?.postiz).toMatchObject({
      sending: false,
      error: "Harbour couldn't reach Postiz.",
    });
    // A failure asked of an older revision is not this piece's news any more.
    expect(view({ ...APPROVED, revision: 2 }, db)("linkedin")?.postiz?.error).toBeNull();
  });
});
