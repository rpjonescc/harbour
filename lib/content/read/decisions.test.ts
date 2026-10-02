import { claimNextJob, enqueueJob, finishJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { decisionStatus } from "./decisions";

const PIECE = "acme-docs-20261001-five-minutes.linkedin";

function decide(db: ReturnType<typeof openTestDb>, params: Record<string, string>) {
  enqueueJob(db, "content-decision", params, "owner@example.com");
  return claimNextJob(db);
}

describe("decisionStatus", () => {
  it("says Saving for a queued or running decision, for the piece and for the idea", () => {
    const db = openTestDb();
    enqueueJob(db, "content-decision", { action: "discard", ideaId: "acme-docs-1-x" }, null);
    decide(db, { action: "approve", pieceId: PIECE, revision: "1" });
    expect([...decisionStatus(db).saving].sort()).toEqual([PIECE, "acme-docs-1-x"].sort());
  });

  it("keeps the newest failure's own sentence and the revision it was asked at", () => {
    const db = openTestDb();
    const job = decide(db, { action: "approve", pieceId: PIECE, revision: "3" });
    finishJob(db, job?.id ?? 0, "failed", "Tick every flag before approving.", new Date());
    const status = decisionStatus(db);
    expect(status.saving.size).toBe(0);
    expect(status.failed.get(PIECE)).toEqual({
      error: "Tick every flag before approving.",
      revision: "3",
      fromState: null,
    });
  });

  it("forgets a failure once a newer decision for the same piece was queued or succeeded", () => {
    const db = openTestDb();
    const first = decide(db, { action: "approve", pieceId: PIECE, revision: "3" });
    finishJob(db, first?.id ?? 0, "failed", "Nope.", new Date());
    const second = decide(db, { action: "approve", pieceId: PIECE, revision: "3", flags: "x" });
    expect(decisionStatus(db).failed.size).toBe(0);
    finishJob(db, second?.id ?? 0, "ok", null, new Date());
    expect(decisionStatus(db)).toMatchObject({ failed: new Map(), saving: new Set() });
  });
});
