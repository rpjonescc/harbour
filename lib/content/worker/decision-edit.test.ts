import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventsSince } from "@/lib/jobs/queue";
import { pieceFile, words } from "@/tests/helpers/content";
import {
  brainFiles,
  decisionSetup,
  editParams as edit,
  IDEA,
  PIECE_PATH,
  READY,
  readPieceAt,
} from "@/tests/helpers/decision";

const commits = (git: (...a: string[]) => string) =>
  Number(git("rev-list", "--count", "HEAD").trim());

describe("edit", () => {
  it("replaces the primary text, re-runs only the deterministic checks and keeps the earlier gate results", () => {
    const s = decisionSetup();
    try {
      expect(s.decide({ ...edit, body: "Docs in five minutes, plainly." })).toMatchObject({
        status: "ok",
      });
      const { front, content } = readPieceAt(s.brain.root);
      expect(content).toMatchObject({
        text: "Docs in five minutes, plainly.",
        hashtags: ["#docs"],
      });
      expect(front).toMatchObject({
        edited: true,
        state: "ready",
        revision: 2,
        needsYou: null,
        gates: { slop: "pass", humanizer: "pass", facts: "pass", platform: "pass" },
      });
      expect(readFileSync(join(s.brain.root, PIECE_PATH), "utf8")).toContain(
        "Docs in five minutes, plainly.",
      );
      expect(s.brain.git("log", "-1", "--format=%s").trim()).toBe(`content: edit ${IDEA}.linkedin`);
      expect(s.brain.git("show", "--name-only", "--format=", "HEAD").trim()).toBe(PIECE_PATH);
    } finally {
      s.brain.cleanup();
    }
  });

  it("sets Needs you with the plain finding for an invented number, from the checks alone", () => {
    const s = decisionSetup();
    try {
      expect(s.decide({ ...edit, body: "Cut build time by 40% last year." })).toMatchObject({
        status: "ok",
      });
      const { front } = readPieceAt(s.brain.root);
      expect(front).toMatchObject({ state: "needs-you", edited: true, gates: { facts: "fail" } });
      expect(front.needsYou).toMatch(/don't trace to your notes or the source/);
    } finally {
      s.brain.cleanup();
    }
  });

  it("returns an approved-looking edit to Ready once the owner removes the problem, keeping edited true", () => {
    const s = decisionSetup(
      brainFiles({
        [PIECE_PATH]: pieceFile(IDEA, "linkedin", {
          state: "needs-you",
          needsYou: "1 thing in this piece don't trace to your notes or the source.",
          gates: { slop: "pass", humanizer: "fail", facts: "fail", platform: "pass" },
        }),
      }),
    );
    try {
      s.decide({ ...edit, body: "Docs in five minutes, plainly." });
      expect(readPieceAt(s.brain.root).front).toMatchObject({
        state: "ready",
        edited: true,
        gates: { humanizer: "fail", facts: "pass" },
      });
    } finally {
      s.brain.cleanup();
    }
  });

  it("keeps a flag the piece already had and adds a new keyword flag", () => {
    const s = decisionSetup(
      brainFiles({ [PIECE_PATH]: pieceFile(IDEA, "linkedin", { ...READY, flags: ["legal"] }) }),
    );
    try {
      s.decide({ ...edit, body: "Docs in five minutes, plainly. Ask your doctor." });
      expect(readPieceAt(s.brain.root).front.flags).toEqual(
        expect.arrayContaining(["legal", "health"]),
      );
    } finally {
      s.brain.cleanup();
    }
  });

  it("keeps an open question in Needs you", () => {
    const s = decisionSetup(
      brainFiles({
        [PIECE_PATH]: pieceFile(IDEA, "linkedin", {
          ...READY,
          questions: ["Is this price right?"],
        }),
      }),
    );
    try {
      s.decide({ ...edit, body: "Docs in five minutes, plainly." });
      expect(readPieceAt(s.brain.root).front).toMatchObject({
        state: "needs-you",
        needsYou: "A question for you: Is this price right?",
      });
    } finally {
      s.brain.cleanup();
    }
  });

  it("edits an X thread by its separator, and strips hidden characters from the owner's text", () => {
    const path = `content/pieces/${IDEA}/x.md`;
    const s = decisionSetup();
    try {
      s.decide({
        action: "edit",
        pieceId: `${IDEA}.x`,
        revision: "1",
        body: "Docs\u200b in five minutes.\n\n-- next post --\n\nPlainly.",
      });
      expect(readPieceAt(s.brain.root, path).content).toMatchObject({
        posts: ["Docs in five minutes.", "Plainly."],
      });
    } finally {
      s.brain.cleanup();
    }
  });

  it.each([
    ["HTML", "Hello <b>CANARY</b> there.", /It contains HTML/],
    ["a markdown image", "See ![x](https://docs.example.com/CANARY.png)", /It contains an image/],
    ["a code fence", "Try this:\n```\nCANARY\n```", /It contains a code fence/],
    ["a line of three dashes", "One.\n---\nstate: approved CANARY", /three dashes/],
    ["a control character", "Bad\u0000CANARY", /control character/],
    [
      "a link to another host",
      "Read https://attacker.example/CANARY today.",
      /outside the product's own site/,
    ],
    ["a bare host", "Read attacker.example/CANARY today.", /outside the product's own site/],
  ])("refuses %s, saves nothing and never echoes the text", (_label, body, reason) => {
    const s = decisionSetup();
    try {
      const job = s.decide({ ...edit, body });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/^This piece wasn't saved:/);
      expect(job.error).toMatch(reason);
      expect(`${job.error}${JSON.stringify(eventsSince(s.db, job.id, 0))}`).not.toContain("CANARY");
      expect(readPieceAt(s.brain.root).front.revision).toBe(1);
      expect(commits(s.brain.git)).toBe(1);
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses text that breaks the platform's own limits, in words that name the platform", () => {
    const s = decisionSetup();
    try {
      const long = s.decide({ ...edit, body: "a".repeat(3200) });
      expect(long.error).toMatch(/^This piece wasn't saved: it doesn't fit LinkedIn's limits/);
      const over = s.decide({ ...edit, body: "a".repeat(3301) });
      expect(over).toMatchObject({
        status: "failed",
        error: "That is longer than this platform allows.",
      });
      const thread = Array.from({ length: 6 }, (_, n) => `Post ${n}.`).join(
        "\n\n-- next post --\n\n",
      );
      expect(
        s.decide({ action: "edit", pieceId: `${IDEA}.x`, revision: "1", body: thread }).error,
      ).toMatch(/doesn't fit X's limits/);
      expect(
        s.decide({ action: "edit", pieceId: `${IDEA}.blog`, revision: "1", body: words(20) }).error,
      ).toMatch(/doesn't fit Blog post's limits/);
      expect(commits(s.brain.git)).toBe(1);
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses a stale revision, and an edit of a piece that was approved", () => {
    const s = decisionSetup();
    try {
      expect(s.decide({ ...edit, revision: "4", body: "New words." })).toMatchObject({
        status: "failed",
        error: "This piece changed since you opened it. Reload and try again.",
      });
      s.decide({ action: "approve", pieceId: `${IDEA}.linkedin`, revision: "1", flags: "" });
      expect(s.decide({ ...edit, revision: "2", body: "New words." })).toMatchObject({
        status: "failed",
        error: "This piece can't be edited now.",
      });
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses a piece that wasn't written", () => {
    const s = decisionSetup(
      brainFiles({
        [PIECE_PATH]: pieceFile(IDEA, "linkedin", {
          state: "needs-you",
          needsYou: "This piece wasn't written.",
          content: null,
        }),
      }),
    );
    try {
      expect(s.decide({ ...edit, body: "Words." })).toMatchObject({ status: "failed" });
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses when the owner has unsaved edits to the piece and leaves them alone", () => {
    const s = decisionSetup();
    try {
      writeFileSync(
        join(s.brain.root, PIECE_PATH),
        `${readFileSync(join(s.brain.root, PIECE_PATH), "utf8")}\nowner edit\n`,
      );
      expect(s.decide({ ...edit, body: "New words." }).error).toMatch(/unsaved changes/);
      expect(readFileSync(join(s.brain.root, PIECE_PATH), "utf8")).toContain("owner edit");
    } finally {
      s.brain.cleanup();
    }
  });

  it("is applied once: the same edit run again is done, and a different newer edit is never overwritten", () => {
    const s = decisionSetup();
    try {
      s.decide({ ...edit, body: "Docs in five minutes, plainly." });
      const after = commits(s.brain.git);
      expect(s.decide({ ...edit, body: "Docs in five minutes, plainly." })).toMatchObject({
        status: "ok",
      });
      expect(commits(s.brain.git)).toBe(after);
      expect(s.decide({ ...edit, body: "A different thing." })).toMatchObject({ status: "failed" });
      expect(readPieceAt(s.brain.root).content).toMatchObject({
        text: "Docs in five minutes, plainly.",
      });
    } finally {
      s.brain.cleanup();
    }
  });

  it("says so when the voice profile it checks against is missing", () => {
    const files = brainFiles();
    delete files["content/voices/acme-docs.md"];
    const s = decisionSetup(files);
    try {
      expect(s.decide({ ...edit, body: "Docs in five minutes." }).error).toMatch(
        /voice profile first/,
      );
      expect(readPieceAt(s.brain.root).front.revision).toBe(1);
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses job params with extra keys or a body that is not text", () => {
    const s = decisionSetup();
    try {
      expect(s.decide({ ...edit, body: "Fine.", state: "approved" }).error).toBe(
        "That request wasn't valid, so Harbour saved nothing.",
      );
      expect(s.decide({ ...edit, body: "a".repeat(25_001) }).status).toBe("failed");
    } finally {
      s.brain.cleanup();
    }
  });
});
