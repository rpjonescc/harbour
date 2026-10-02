import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enqueueJob, getJob } from "@/lib/jobs/queue";
import { pieceFile } from "@/tests/helpers/content";
import {
  approveParams as approve,
  brainFiles,
  decisionSetup,
  editParams as edit,
  IDEA,
  PIECE_PATH,
  readPieceAt,
} from "@/tests/helpers/decision";
import { claim } from "@/tests/helpers/run-job";
import { runContentDecision } from "./decision-job";

const commits = (git: (...a: string[]) => string) =>
  Number(git("rev-list", "--count", "HEAD").trim());
const SAME = "Docs that ship in five minutes.";

describe("an edit that changes nothing", () => {
  it("is refused and neither clears Needs you nor marks the piece edited, so approving still needs the confirmation", () => {
    const s = decisionSetup(
      brainFiles({
        [PIECE_PATH]: pieceFile(IDEA, "linkedin", {
          state: "needs-you",
          needsYou: "The humanizer check still found 1 pattern. Edit the piece, or discard it.",
          gates: { slop: "pass", humanizer: "fail", facts: "pass", platform: "pass" },
        }),
      }),
    );
    try {
      expect(s.decide({ ...edit, body: SAME })).toMatchObject({
        status: "failed",
        error: "Nothing changed, so Harbour saved nothing.",
      });
      expect(readPieceAt(s.brain.root).front).toMatchObject({
        state: "needs-you",
        edited: false,
        revision: 1,
      });
      expect(s.decide(approve).error).toMatch(/^Approve anyway\?/);
      expect(commits(s.brain.git)).toBe(1);
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("a repeated edit against a piece that is no longer editable", () => {
  it("is stale, not 'already saved', when the piece was discarded", () => {
    const s = decisionSetup(
      brainFiles({
        [PIECE_PATH]: pieceFile(IDEA, "linkedin", {
          state: "discarded",
          revision: 2,
          edited: true,
          content: { text: "Docs in five minutes, plainly.", hashtags: ["#docs"] },
        }),
      }),
    );
    try {
      const job = s.decide({ ...edit, body: "Docs in five minutes, plainly." });
      expect(job).toMatchObject({
        status: "failed",
        error: "This piece changed since you opened it. Reload and try again.",
      });
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("content switched off", () => {
  it("fails with a fixed sentence and writes nothing", () => {
    const s = decisionSetup();
    try {
      s.deps.enabled = false;
      expect(s.decide(approve)).toMatchObject({
        status: "failed",
        error: "Content is switched off, so Harbour saved nothing.",
      });
      expect(readPieceAt(s.brain.root).front.revision).toBe(1);
      expect(commits(s.brain.git)).toBe(1);
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("a run cut off between writing and committing", () => {
  it("is finished by the same job run again: the files it wrote are committed, and only those", () => {
    const s = decisionSetup();
    try {
      s.decide(approve);
      s.brain.git("reset", "-q", "--mixed", "HEAD~1"); // as if the commit never happened
      expect(s.brain.git("status", "--porcelain").trim()).not.toBe("");
      const again = s.decide(approve);
      expect(again).toMatchObject({ status: "ok" });
      expect(commits(s.brain.git)).toBe(2);
      expect(s.brain.git("status", "--porcelain").trim()).toBe("");
    } finally {
      s.brain.cleanup();
    }
  });

  it("leaves an owner's other uncommitted file alone", () => {
    const s = decisionSetup();
    try {
      s.decide(approve);
      s.brain.git("reset", "-q", "--mixed", "HEAD~1");
      s.decide(approve);
      expect(readFileSync(join(s.brain.root, "README.md"), "utf8")).toBe("# Brain\n");
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("an orphaned export", () => {
  it("never blocks approving: the leftover file keeps its name and the new export is numbered", () => {
    const s = decisionSetup();
    try {
      s.decide(approve);
      const first = readPieceAt(s.brain.root).front.exportPath ?? "";
      // The approval is undone by hand (piece back to ready), the export file is left behind.
      s.brain.git("reset", "-q", "--hard", "HEAD~1");
      s.brain.git("checkout", "-q", "HEAD@{1}", "--", first);
      s.brain.git("reset", "-q", "--", first);
      s.decide(approve);
      expect(readPieceAt(s.brain.root).front.exportPath).toBe(first.replace(/\.md$/, "-2.md"));
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("discarding an idea", () => {
  it("cancels its chain steps that are still waiting, and only its own", () => {
    const s = decisionSetup();
    try {
      enqueueJob(
        s.db,
        "content-decision",
        { action: "discard", ideaId: IDEA },
        "owner@example.com",
      );
      const job = claim({ db: s.db });
      const mine = enqueueJob(s.db, "content-gate", { ideaId: IDEA, gate: "facts" }, null).id;
      const other = enqueueJob(
        s.db,
        "content-gate",
        { ideaId: "acme-docs-20261001-other" },
        null,
      ).id;
      runContentDecision(s.deps, job);
      expect(getJob(s.db, mine)?.status).toBe("cancelled");
      expect(getJob(s.db, other)?.status).toBe("queued");
    } finally {
      s.brain.cleanup();
    }
  });
});
