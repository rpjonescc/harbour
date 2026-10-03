import { chmodSync } from "node:fs";
import { join } from "node:path";
import { claimNextJob, enqueueJob, finishJob } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { ACME, digestFile, ideaFile, pieceFile, VOICE_ACME } from "@/tests/helpers/content";
import { openTestDb } from "@/tests/helpers/db";
import { countReadyPieces } from "./ready-count";
import { contentView } from "./view";

const IDEA = "acme-docs-20261001-five-minutes";
const NOW = { today: "2026-10-02", tokenSet: true };
const base = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "content/digests/2026-10-01.md": digestFile("2026-10-01", [
    ["acme-docs", "Rewrote the getting-started guide around a short first deploy."],
  ]),
};
const idea = { [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile({ state: "drafted" }) };
/** Six pieces: the first `ready` ones are ready, the next `needs` need you, the rest are drafting. */
function pieces(ready: number, needs: number) {
  const files: Record<string, string> = { ...idea };
  ["linkedin", "x", "instagram", "facebook", "blog", "website"].forEach((platform, i) => {
    const state = i < ready ? "ready" : i < ready + needs ? "needs-you" : "drafting";
    files[`content/pieces/${IDEA}/${platform}.md`] = pieceFile(IDEA, platform as "x", {
      state,
      needsYou:
        state === "needs-you"
          ? "The humanizer check still found 1 pattern. Edit the piece, or discard it."
          : null,
    });
  });
  return files;
}
const view = (files: Record<string, string>, db = openTestDb()) => {
  const { root, cleanup } = makeBrain(files);
  try {
    return contentView({ db, root, products: [ACME], ...NOW });
  } finally {
    cleanup();
  }
};
const count = (v: ReturnType<typeof contentView>, id: string) =>
  v.tabs.find((t) => t.id === id)?.count;

describe("contentView", () => {
  it("counts each tab, opens on Ready for you when any piece is ready, and rolls the idea up", () => {
    const v = view({ ...base, ...pieces(4, 2) });
    expect(count(v, "ready")).toBe(4);
    expect(count(v, "needs-you")).toBe(2);
    expect(v.defaultTab).toBe("ready");
    expect(v.ideas[0]).toMatchObject({
      id: IDEA,
      productName: "Acme Docs",
      rollup: "4 ready, 2 need you",
    });
    expect(v.ideas[0]?.pieces.filter((p) => p.tab === "ready")).toHaveLength(4);
  });

  it("opens on Needs you, then Ideas, when nothing is ready", () => {
    expect(view({ ...base, ...pieces(0, 2) }).defaultTab).toBe("needs-you");
    const waiting = { ...base, [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile() };
    expect(view(waiting).defaultTab).toBe("ideas");
    expect(view(base).defaultTab).toBe("ideas");
  });

  it("shows a drafting piece as Being written while a step for its idea is queued or running", () => {
    const db = openTestDb();
    enqueueJob(db, "content-gate", { ideaId: IDEA, gate: "humanizer", attempt: "1" }, null);
    expect(count(view({ ...base, ...pieces(0, 0) }, db), "writing")).toBe(6);
  });

  it("derives Needs you, with the step's sentence and a retry, when the newest step failed", () => {
    const db = openTestDb();
    const job = enqueueJob(
      db,
      "content-gate",
      { ideaId: IDEA, gate: "humanizer", attempt: "1" },
      null,
    );
    claimNextJob(db);
    finishJob(db, job.id, "failed", "boom");
    const v = view({ ...base, ...pieces(0, 0) }, db);
    expect(count(v, "needs-you")).toBe(6);
    expect(v.ideas[0]?.pieces[0]).toMatchObject({
      needsYou: "The humanizer check didn't finish. Try again.",
      retry: true,
    });
  });

  it("puts an idea under Ideas, a failed draft's idea under Ideas with a retry note, and a discarded idea under Discarded", () => {
    const db = openTestDb();
    const failed = enqueueJob(db, "content-draft", { ideaId: IDEA }, "me");
    claimNextJob(db);
    finishJob(db, failed.id, "failed", "boom");
    const v = view({ ...base, [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile() }, db);
    expect(v.ideas[0]).toMatchObject({
      tab: "ideas",
      retry: true,
      note: "The draft didn't finish. Try again.",
    });
    const gone = view({
      ...base,
      [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile({ state: "discarded" }),
    });
    expect(count(gone, "discarded")).toBe(1);
  });

  it("names unreadable files, shows the rest, and caps the list at the newest 200 ideas, saying so", () => {
    const many = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [
        `content/ideas/acme-docs/acme-docs-20261001-i${String(i).padStart(3, "0")}.md`,
        ideaFile(),
      ]),
    );
    const v = view({
      ...base,
      ...many,
      "content/ideas/acme-docs/acme-docs-20261001-zzz.md": "no frontmatter",
    });
    expect(v.capped).toBe("ideas");
    expect(v.ideas).toHaveLength(200);
    expect(v.unreadable).toEqual(["content/ideas/acme-docs/acme-docs-20261001-zzz.md"]);
  });

  it("reports a missing or invalid voice profile per product, and a digest gap when none is recent", () => {
    const none = view({});
    expect(none.voice).toEqual([
      { productId: "acme-docs", name: "Acme Docs", state: "missing", notesMissing: true },
    ]);
    expect(none.digest.gap).toBe(true);
    expect(view({ "content/voices/acme-docs.md": "no frontmatter" }).voice[0]).toMatchObject({
      state: "invalid",
    });
    expect(view(base).digest.gap).toBe(false);
    expect(view({ "content/digests/2026-09-20.md": digestFile("2026-09-20", []) }).digest.gap).toBe(
      true,
    );
    // A file named for a day that does not exist is not a digest.
    expect(view({ "content/digests/2026-09-31.md": digestFile("2026-10-01", []) }).digest.gap).toBe(
      true,
    );
  });

  it("gives each piece clean copy parts, flag lines, and an empty body for a stub", () => {
    const files = pieces(6, 0);
    files[`content/pieces/${IDEA}/x.md`] = pieceFile(
      IDEA,
      "x",
      {
        state: "ready",
        flags: ["pricing"],
        claims: [{ text: "Costs $9.", trace: "source:p1", flag: "pricing" }],
      },
      "1/1 Ship docs in five minutes.",
    );
    files[`content/pieces/${IDEA}/website.md`] = pieceFile(
      IDEA,
      "website",
      { state: "needs-you", needsYou: "This piece wasn't written. Try again.", content: null },
      "",
    );
    const v = view({ ...base, ...files });
    const x = v.ideas[0]?.pieces.find((p) => p.platform === "x");
    expect(x?.copy.map((c) => c.label)).toEqual(["Post 1"]);
    expect(x?.flagLines).toEqual(["Check before posting: 1 pricing claim"]);
    expect(v.ideas[0]?.pieces.find((p) => p.platform === "website")).toMatchObject({
      empty: true,
      copy: [],
      text: "",
      tab: "needs-you",
    });
  });

  describe("an idea that is drafting and has no pieces yet", () => {
    const drafting = {
      ...base,
      [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile({ state: "drafting" }),
    };
    const step = (
      kind: "content-atomise" | "content-draft",
      end: "failed" | "queued" | "running",
    ) => {
      const db = openTestDb();
      const job = enqueueJob(db, kind, { ideaId: IDEA }, null);
      if (end !== "queued") claimNextJob(db);
      if (end === "failed") finishJob(db, job.id, "failed", "boom");
      return db;
    };

    it("is Needs you with the step's sentence and Try again when the step failed", () => {
      const v = view(drafting, step("content-atomise", "failed"));
      expect(v.ideas[0]).toMatchObject({
        tab: "needs-you",
        retry: true,
        note: "The platform pieces didn't finish. Try again.",
      });
      expect(count(v, "needs-you")).toBe(1);
      expect(v.defaultTab).toBe("needs-you");
    });

    it("is Being written while a step is queued or running", () => {
      for (const end of ["queued", "running"] as const) {
        const v = view(drafting, step("content-atomise", end));
        expect(v.ideas[0]).toMatchObject({ tab: "writing", retry: false });
        expect(count(v, "writing")).toBe(1);
      }
    });

    it("is Being written, never invisible, when nothing is running and nothing failed", () => {
      expect(count(view(drafting), "writing")).toBe(1);
    });
  });

  it("reports an unreadable content folder instead of crashing, and hides the badge", () => {
    const { root, cleanup } = makeBrain({
      ...base,
      [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile(),
    });
    const dir = join(root, "content/ideas/acme-docs");
    chmodSync(dir, 0o000);
    try {
      if (process.getuid?.() === 0) return; // root can read anything: the case can't be made
      const v = contentView({ db: openTestDb(), root, products: [ACME], ...NOW });
      expect(v.folderError).toBe(true);
      expect(v.ideas).toEqual([]);
      expect(countReadyPieces(root, [ACME])).toBeNull();
    } finally {
      chmodSync(dir, 0o755);
      cleanup();
    }
  });

  it("gives the same Ready count in the sidebar badge and on the Ready tab", () => {
    const { root, cleanup } = makeBrain({ ...base, ...pieces(3, 2) });
    try {
      const v = contentView({ db: openTestDb(), root, products: [ACME], ...NOW });
      expect(countReadyPieces(root, [ACME])).toBe(count(v, "ready"));
      expect(count(v, "ready")).toBe(3);
    } finally {
      cleanup();
    }
  });

  it("keeps the badge count for 15 seconds, then reads again", () => {
    const { root, cleanup } = makeBrain({ ...base, ...pieces(1, 0) });
    try {
      const t0 = 1_000_000;
      expect(countReadyPieces(root, [ACME], t0)).toBe(1);
      cleanup();
      expect(countReadyPieces(root, [ACME], t0 + 14_000)).toBe(1);
      expect(countReadyPieces(root, [ACME], t0 + 16_000)).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("shows why the newest decision saved nothing, only while the piece is still at the revision it was asked at", () => {
    const db = openTestDb();
    const ask = (revision: string) => {
      enqueueJob(
        db,
        "content-decision",
        { action: "approve", pieceId: `${IDEA}.linkedin`, revision, flags: "" },
        "owner@example.com",
      );
      const job = claimNextJob(db);
      finishJob(db, job?.id ?? 0, "failed", "Tick every flag before approving.", new Date());
    };
    ask("1");
    const linkedin = (v: ReturnType<typeof contentView>) =>
      v.ideas[0]?.pieces.find((p) => p.platform === "linkedin");
    expect(linkedin(view({ ...base, ...pieces(2, 0) }, db))?.decisionError).toBe(
      "Tick every flag before approving.",
    );
    ask("5"); // asked of a revision the piece is no longer at
    expect(linkedin(view({ ...base, ...pieces(2, 0) }, db))?.decisionError).toBeNull();
  });

  it("marks a piece Saving while its decision job is waiting", () => {
    const db = openTestDb();
    enqueueJob(
      db,
      "content-decision",
      { action: "approve", pieceId: `${IDEA}.linkedin`, revision: "1", flags: "" },
      "owner@example.com",
    );
    const v = view({ ...base, ...pieces(2, 0) }, db);
    expect(v.ideas[0]?.pieces.map((p) => p.saving)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("shows why an idea's decision failed only while the idea is in the state it was asked in", () => {
    const db = openTestDb();
    enqueueJob(
      db,
      "content-decision",
      { action: "discard", ideaId: IDEA, fromState: "drafted" },
      "owner@example.com",
    );
    finishJob(db, claimNextJob(db)?.id ?? 0, "failed", "Harbour couldn't save that.", new Date());
    expect(view({ ...base, ...pieces(2, 0) }, db).ideas[0]?.decisionError).toBe(
      "Harbour couldn't save that.",
    );
    const drafting = { ...pieces(2, 0) };
    const path = `content/ideas/acme-docs/${IDEA}.md`;
    drafting[path] = ideaFile({ state: "drafting" });
    expect(view({ ...base, ...drafting }, db).ideas[0]?.decisionError).toBeNull();
  });
});
