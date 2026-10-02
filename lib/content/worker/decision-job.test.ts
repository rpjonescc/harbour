import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventsSince } from "@/lib/jobs/queue";
import { seedPieces } from "@/tests/helpers/chain";
import { pieceFile } from "@/tests/helpers/content";
import {
  approveParams as approve,
  brainFiles,
  decisionSetup,
  IDEA,
  PIECE_PATH,
  READY,
  readPieceAt,
} from "@/tests/helpers/decision";

const OTHER = "acme-docs-20261001-other";
const piece = `${IDEA}.linkedin`;
const commits = (git: (...a: string[]) => string) =>
  Number(git("rev-list", "--count", "HEAD").trim());

describe("approve", () => {
  it("approves a ready piece, exports it clean, and commits exactly those two files", () => {
    const s = decisionSetup();
    try {
      expect(s.decide(approve)).toMatchObject({ status: "ok" });
      const { front } = readPieceAt(s.brain.root);
      expect(front).toMatchObject({
        state: "approved",
        revision: 2,
        approvedAt: "2026-10-02",
        exportPath: expect.stringMatching(/^content\/approved\/linkedin\/2026-10-02-/),
      });
      const exported = readFileSync(join(s.brain.root, front.exportPath ?? ""), "utf8");
      expect(exported).toContain("platform: linkedin");
      expect(exported).toContain("Docs that ship in five minutes.");
      expect(exported).not.toMatch(/gates|revision|sha256|state:/);
      expect(s.brain.git("log", "-1", "--format=%s").trim()).toBe(`content: approve ${piece}`);
      expect(
        s.brain.git("show", "--name-only", "--format=", "HEAD").trim().split("\n").sort(),
      ).toEqual([front.exportPath, PIECE_PATH].sort());
      expect(s.brain.git("status", "--porcelain").trim()).toBe("");
    } finally {
      s.brain.cleanup();
    }
  });

  it("runs no model and records only counts and fixed sentences", () => {
    const s = decisionSetup();
    try {
      const job = s.decide(approve);
      const events = eventsSince(s.db, job.id, 0).map((e) => e.text);
      expect(events).toEqual(["Committed 2 file(s)"]);
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses a stale revision, an unticked flag and an unconfirmed Needs you piece, writing nothing", () => {
    const flagged = decisionSetup(
      brainFiles({ [PIECE_PATH]: pieceFile(IDEA, "linkedin", { ...READY, flags: ["pricing"] }) }),
    );
    const open = decisionSetup(
      brainFiles({
        [PIECE_PATH]: pieceFile(IDEA, "linkedin", {
          state: "needs-you",
          needsYou: "The humanizer check still found 1 pattern. Edit the piece, or discard it.",
        }),
      }),
    );
    const plain = decisionSetup();
    try {
      expect(plain.decide({ ...approve, revision: "7" })).toMatchObject({
        status: "failed",
        error: "This piece changed since you opened it. Reload and try again.",
      });
      expect(flagged.decide(approve)).toMatchObject({
        status: "failed",
        error: "Tick every flag before approving.",
      });
      expect(flagged.decide({ ...approve, flags: "pricing" })).toMatchObject({ status: "ok" });
      expect(open.decide(approve).error).toMatch(/Approve anyway\?/);
      expect(readPieceAt(open.brain.root).front.state).toBe("needs-you");
      expect(open.decide({ ...approve, confirm: "1" })).toMatchObject({ status: "ok" });
      expect(readPieceAt(plain.brain.root).front.state).toBe("ready");
      expect(commits(plain.brain.git)).toBe(1);
    } finally {
      for (const s of [flagged, open, plain]) s.brain.cleanup();
    }
  });

  it("refuses when the owner has unsaved edits to the piece, and leaves the file as the owner has it", () => {
    const s = decisionSetup();
    try {
      writeFileSync(
        join(s.brain.root, PIECE_PATH),
        `${readFileSync(join(s.brain.root, PIECE_PATH), "utf8")}\nowner edit\n`,
      );
      expect(s.decide(approve)).toMatchObject({
        status: "failed",
        error: "You have unsaved changes to this piece in your editor; Harbour saved nothing.",
      });
      expect(readFileSync(join(s.brain.root, PIECE_PATH), "utf8")).toContain("owner edit");
      expect(commits(s.brain.git)).toBe(1);
    } finally {
      s.brain.cleanup();
    }
  });

  it("is applied once: the same job run again after a restart finds it done and changes nothing", () => {
    const s = decisionSetup();
    try {
      s.decide(approve);
      const after = commits(s.brain.git);
      const again = s.decide(approve);
      expect(again).toMatchObject({ status: "ok" });
      expect(eventsSince(s.db, again.id, 0).map((e) => e.text)).toEqual([
        "Already saved. Nothing more to do.",
      ]);
      expect(commits(s.brain.git)).toBe(after);
      expect(readPieceAt(s.brain.root).front.revision).toBe(2);
    } finally {
      s.brain.cleanup();
    }
  });

  it("gives a second export with the same name on the same day a numbered file name", () => {
    const s = decisionSetup(brainFiles({ ...seedPieces(OTHER, READY) }));
    try {
      s.decide(approve);
      s.decide({ ...approve, pieceId: `${OTHER}.linkedin` });
      const first = readPieceAt(s.brain.root).front.exportPath ?? "";
      const second =
        readPieceAt(s.brain.root, `content/pieces/${OTHER}/linkedin.md`).front.exportPath ?? "";
      expect(second).toBe(first.replace(/\.md$/, "-2.md"));
    } finally {
      s.brain.cleanup();
    }
  });

  it("never overwrites a file the owner already has at the export name, even an uncommitted one", () => {
    const s = decisionSetup();
    try {
      const taken = "content/approved/linkedin/2026-10-02-five-minutes-to-a-first-deploy.md";
      mkdirSync(join(s.brain.root, "content/approved/linkedin"), { recursive: true });
      writeFileSync(join(s.brain.root, taken), "the owner's own file");
      expect(s.decide(approve)).toMatchObject({ status: "ok" });
      expect(readFileSync(join(s.brain.root, taken), "utf8")).toBe("the owner's own file");
      expect(readPieceAt(s.brain.root).front.exportPath).toBe(taken.replace(/\.md$/, "-2.md"));
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses plainly when nine exports already have the name today", () => {
    const s = decisionSetup();
    try {
      const base = "content/approved/linkedin/2026-10-02-five-minutes-to-a-first-deploy";
      mkdirSync(join(s.brain.root, "content/approved/linkedin"), { recursive: true });
      for (const suffix of ["", "-2", "-3", "-4", "-5", "-6", "-7", "-8", "-9"]) {
        writeFileSync(join(s.brain.root, `${base}${suffix}.md`), "x");
      }
      expect(s.decide(approve)).toMatchObject({
        status: "failed",
        error: expect.stringMatching(/nine exports/),
      });
      expect(readPieceAt(s.brain.root).front.state).toBe("ready");
    } finally {
      s.brain.cleanup();
    }
  });

  it("puts a hostile title in the file name only as a safe slug", () => {
    const title = "../../../etc/passwd \u202e\u200b";
    const s = decisionSetup(
      brainFiles({ [PIECE_PATH]: pieceFile(IDEA, "linkedin", { ...READY, title }) }),
    );
    try {
      expect(s.decide(approve)).toMatchObject({ status: "ok" });
      const path = readPieceAt(s.brain.root).front.exportPath ?? "";
      expect(path).toMatch(/^content\/approved\/linkedin\/2026-10-02-etc-passwd\.md$/);
    } finally {
      s.brain.cleanup();
    }
  });

  it("puts everything back and says so when the commit cannot be made", () => {
    const s = decisionSetup();
    try {
      const before = readFileSync(join(s.brain.root, PIECE_PATH), "utf8");
      writeFileSync(join(s.brain.root, ".git/index.lock"), "");
      const job = s.decide(approve);
      expect(job).toMatchObject({
        status: "failed",
        error:
          "Harbour couldn't save that. Check the brain repository, then try again. Nothing was changed.",
      });
      expect(readFileSync(join(s.brain.root, PIECE_PATH), "utf8")).toBe(before);
      // An empty folder may remain; no file does, and git sees no change at all.
      expect(s.brain.git("status", "--porcelain").trim()).toBe("");
    } finally {
      s.brain.cleanup();
    }
  });

  it("keeps the commit and says so when the push fails", () => {
    const s = decisionSetup();
    try {
      s.brain.git("remote", "set-url", "origin", join(s.brain.remote, "missing.git"));
      const job = s.decide(approve);
      expect(job.status).toBe("ok");
      expect(eventsSince(s.db, job.id, 0).map((e) => e.text)).toContain(
        "The decision is saved here, but it couldn't be pushed to the brain repository yet. Harbour will try again.",
      );
      expect(commits(s.brain.git)).toBe(2);
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("discard", () => {
  const discard = { action: "discard", pieceId: piece, revision: "1", flags: "" };

  it("discards an approved piece and removes its export in the same commit", () => {
    const s = decisionSetup();
    try {
      s.decide(approve);
      const exportPath = readPieceAt(s.brain.root).front.exportPath ?? "";
      expect(s.decide({ ...discard, revision: "2" })).toMatchObject({ status: "ok" });
      expect(readPieceAt(s.brain.root).front).toMatchObject({
        state: "discarded",
        exportPath: null,
        revision: 3,
      });
      expect(existsSync(join(s.brain.root, exportPath))).toBe(false);
      expect(s.brain.git("show", "--name-status", "--format=", "HEAD")).toContain(
        `D\t${exportPath}`,
      );
      expect(s.brain.git("log", "-1", "--format=%s").trim()).toBe(`content: discard ${piece}`);
    } finally {
      s.brain.cleanup();
    }
  });

  it("keeps a discarded piece's file and its sidecar (nothing is deleted from history)", () => {
    const s = decisionSetup();
    try {
      s.decide(discard);
      expect(existsSync(join(s.brain.root, PIECE_PATH))).toBe(true);
      expect(existsSync(join(s.brain.root, `content/pieces/${IDEA}/linkedin.gates.json`))).toBe(
        true,
      );
    } finally {
      s.brain.cleanup();
    }
  });

  it("discards an idea and every piece it has, and an approved one loses its export", () => {
    const s = decisionSetup();
    try {
      s.decide(approve);
      const exportPath = readPieceAt(s.brain.root).front.exportPath ?? "";
      expect(s.decide({ action: "discard", ideaId: IDEA })).toMatchObject({ status: "ok" });
      for (const platform of ["linkedin", "x", "instagram", "facebook", "blog", "website"]) {
        expect(readPieceAt(s.brain.root, `content/pieces/${IDEA}/${platform}.md`).front.state).toBe(
          "discarded",
        );
      }
      expect(
        readFileSync(join(s.brain.root, `content/ideas/acme-docs/${IDEA}.md`), "utf8"),
      ).toContain("state: discarded");
      expect(existsSync(join(s.brain.root, exportPath))).toBe(false);
      expect(s.brain.git("log", "-1", "--format=%s").trim()).toBe(`content: discard ${IDEA}`);
    } finally {
      s.brain.cleanup();
    }
  });

  it("is applied once: discarding the same idea again is done, with no new commit", () => {
    const s = decisionSetup();
    try {
      s.decide({ action: "discard", ideaId: IDEA });
      const after = commits(s.brain.git);
      expect(s.decide({ action: "discard", ideaId: IDEA })).toMatchObject({ status: "ok" });
      expect(commits(s.brain.git)).toBe(after);
    } finally {
      s.brain.cleanup();
    }
  });

  it("discards an idea whose pieces are stubs, or that has none yet", () => {
    const stub = pieceFile(IDEA, "linkedin", {
      state: "needs-you",
      needsYou: "This piece wasn't written.",
      content: null,
    });
    const s = decisionSetup(brainFiles({ [PIECE_PATH]: stub }));
    const files = seedPieces(IDEA);
    const ideaPath = `content/ideas/acme-docs/${IDEA}.md`;
    const lone = decisionSetup({
      [ideaPath]: (files[ideaPath] ?? "").replace("state: drafted", "state: drafting"),
    });
    try {
      expect(s.decide({ action: "discard", ideaId: IDEA })).toMatchObject({ status: "ok" });
      expect(readPieceAt(s.brain.root).front.state).toBe("discarded");
      expect(lone.decide({ action: "discard", ideaId: IDEA })).toMatchObject({ status: "ok" });
      expect(readFileSync(join(lone.brain.root, ideaPath), "utf8")).toContain("state: discarded");
    } finally {
      s.brain.cleanup();
      lone.brain.cleanup();
    }
  });

  it("removes only a path Harbour could have made: a tampered export path is refused and nothing is deleted", () => {
    const sourcePath = `content/pieces/${IDEA}/source.md`;
    const s = decisionSetup(
      brainFiles({
        [PIECE_PATH]: pieceFile(IDEA, "linkedin", {
          state: "approved",
          approvedAt: "2026-10-02",
          exportPath: sourcePath,
        }),
      }),
    );
    try {
      expect(s.decide(discard)).toMatchObject({
        status: "failed",
        error: expect.stringMatching(/export isn't where Harbour put it/),
      });
      expect(existsSync(join(s.brain.root, sourcePath))).toBe(true);
      expect(readPieceAt(s.brain.root).front.state).toBe("approved");
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses a request that is not valid, and an idea that does not exist", () => {
    const s = decisionSetup();
    try {
      expect(s.decide({ action: "discard", ideaId: IDEA, extra: "x" })).toMatchObject({
        status: "failed",
        error: "That request wasn't valid, so Harbour saved nothing.",
      });
      expect(s.decide({ action: "publish", ideaId: IDEA })).toMatchObject({ status: "failed" });
      expect(s.decide({ action: "discard", ideaId: "acme-docs-20261001-nope" })).toMatchObject({
        status: "failed",
        error: "Harbour couldn't find that idea or piece. Reload the page and try again.",
      });
    } finally {
      s.brain.cleanup();
    }
  });
});
