import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_NOTE } from "@/lib/explain/voice/fallback";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { GOOD_NOTE, noteFileText, seedNoteJob, vouchForFiles } from "@/tests/helpers/note";
import { noteSlot } from "./view";

/** A db where every stamp-named file in the brain has a succeeded job holding its digest. */
function vouched(root: string) {
  const db = openTestDb();
  vouchForFiles(db, root);
  return db;
}
const NOW = new Date("2026-10-02T09:00:00Z"); // 10:00 in London
const base = (root: string, over = {}) => ({
  db: vouched(root),
  personality: "warm" as const,
  isSample: false,
  root,
  timeZone: "Europe/London",
  noteTime: "06:30",
  scheduled: true,
  tokenSet: true,
  now: NOW,
  ...over,
});

describe("noteSlot", () => {
  it("is hidden when the personality is quiet, even with a note on disk", () => {
    const brain = makeBrain({ "notes/daily/2026-10-02-0630.md": noteFileText(GOOD_NOTE) });
    try {
      expect(noteSlot(base(brain.root, { personality: "quiet" }))).toBeNull();
    } finally {
      brain.cleanup();
    }
  });

  it("shows the fixed sample note on the sample Today, never what is on disk", () => {
    const brain = makeBrain({ "notes/daily/2026-10-02-0630.md": noteFileText(GOOD_NOTE) });
    try {
      expect(noteSlot(base(brain.root, { isSample: true }))?.view).toEqual({
        kind: "sample",
        note: SAMPLE_NOTE,
      });
    } finally {
      brain.cleanup();
    }
  });

  it("shows the newest valid note from the last 24 hours, with when it was written", () => {
    const brain = makeBrain({
      "notes/daily/2026-10-01-0630.md": noteFileText({ ...GOOD_NOTE, headline: "Old" }),
      "notes/daily/2026-10-02-0630.md": noteFileText({ ...GOOD_NOTE, headline: "Fresh" }),
    });
    try {
      const slot = noteSlot(base(brain.root));
      expect(slot).toMatchObject({ noteTime: "06:30", tokenSet: true });
      expect(slot?.view).toMatchObject({ kind: "note", note: { headline: "Fresh" } });
      expect(slot?.view.kind === "note" && slot.view.at.toISOString()).toBe(
        "2026-10-02T05:30:00.000Z",
      );
    } finally {
      brain.cleanup();
    }
  });

  it("shows the quiet gap when the newest note is older than 24 hours, or there is none", () => {
    const old = makeBrain({ "notes/daily/2026-09-30-0630.md": noteFileText(GOOD_NOTE) });
    const none = makeBrain({ "README.md": "# Brain\n" });
    try {
      for (const brain of [old, none]) {
        expect(noteSlot(base(brain.root))?.view).toEqual({
          kind: "gap",
          line: "No note yet today. The next one is written at 06:30.",
        });
      }
    } finally {
      old.cleanup();
      none.cleanup();
    }
  });

  it("words the gap without a time when no schedule runs (off, or no token)", () => {
    const brain = makeBrain({ "README.md": "# Brain\n" });
    try {
      expect(noteSlot(base(brain.root, { scheduled: false }))).toMatchObject({
        noteTime: null,
        view: { kind: "gap", line: "No note yet today." },
      });
    } finally {
      brain.cleanup();
    }
  });

  describe("the latest run", () => {
    const slotWith = (jobs: ("queued" | "running" | "ok" | "failed" | "cancelled")[]) => {
      const brain = makeBrain({ "README.md": "# Brain\n" });
      try {
        const db = openTestDb();
        jobs.forEach((status, i) => {
          seedNoteJob(db, `2026-10-02-0${i}30`, status);
        });
        return noteSlot(base(brain.root, { db }))?.latestRun;
      } finally {
        brain.cleanup();
      }
    };

    it("is null when no note was ever queued", () => {
      expect(slotWith([])).toBeNull();
    });

    it("is the newest daily-note job, whatever its status", () => {
      expect(slotWith(["ok", "failed"])).toEqual({ id: 2, status: "failed" });
      expect(slotWith(["failed", "ok"])).toEqual({ id: 2, status: "ok" });
      expect(slotWith(["ok", "running"])).toEqual({ id: 2, status: "running" });
      expect(slotWith(["queued"])).toEqual({ id: 1, status: "queued" });
    });

    it("is null on the sample Today and when the notes cannot be read", () => {
      const brain = makeBrain({ "notes/daily": "a file where the folder should be" });
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        expect(noteSlot(base(brain.root, { isSample: true }))?.latestRun).toBeNull();
        expect(noteSlot(base(brain.root))?.latestRun).toBeNull();
      } finally {
        error.mockRestore();
        brain.cleanup();
      }
    });
  });

  it("never shows a note that is not valid: the gap, not the file", () => {
    const brain = makeBrain({
      "notes/daily/2026-10-02-0630.md": noteFileText({
        ...GOOD_NOTE,
        body: "See [this](https://x.example).",
      }),
    });
    try {
      expect(noteSlot(base(brain.root))?.view.kind).toBe("gap");
    } finally {
      brain.cleanup();
    }
  });

  it("says it could not read the folder, and records why, instead of showing a gap", () => {
    const brain = makeBrain({ "notes/daily": "a file where the folder should be" });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(noteSlot(base(brain.root))?.view).toEqual({
        kind: "unavailable",
        line: "Harbour couldn't read today's note. Everything else on this page is up to date.",
      });
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
      brain.cleanup();
    }
  });

  it("shows the gap for a stamp-named note with no succeeded job, whatever it says", () => {
    const brain = makeBrain({ "notes/daily/2026-10-02-0630.md": noteFileText(GOOD_NOTE) });
    try {
      expect(noteSlot(base(brain.root, { db: openTestDb() }))?.view.kind).toBe("gap");
    } finally {
      brain.cleanup();
    }
  });

  it("shows the gap when the file was edited after its job vouched for it", () => {
    const brain = makeBrain({ "notes/daily/2026-10-02-0630.md": noteFileText(GOOD_NOTE) });
    try {
      const db = vouched(brain.root);
      writeFileSync(
        join(brain.root, "notes/daily/2026-10-02-0630.md"),
        noteFileText({ ...GOOD_NOTE, headline: "Edited by an agent" }),
      );
      expect(noteSlot(base(brain.root, { db }))?.view.kind).toBe("gap");
    } finally {
      brain.cleanup();
    }
  });
});
