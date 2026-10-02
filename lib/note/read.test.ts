import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import {
  GOOD_NOTE,
  noteFileText,
  seedNoteJob,
  seedPublishedNote,
  vouchForFiles,
} from "@/tests/helpers/note";
import { noteDigest } from "./digest";
import { freshNote, readNotes } from "./read";

const NOW = new Date("2026-10-02T09:00:00Z"); // 10:00 in London (BST)
const ZONE = "Europe/London";
/** A db where every stamp-named file in the brain is vouched for: the job rule is tested below. */
const vouched = (root: string) => {
  const db = openTestDb();
  vouchForFiles(db, root);
  return db;
};
const file = (stamp: string, headline = "Headline") =>
  [`notes/daily/${stamp}.md`, noteFileText({ ...GOOD_NOTE, headline })] as const;

describe("readNotes", () => {
  it("lists valid notes newest first, with the instant their stamp names", () => {
    const brain = makeBrain(
      Object.fromEntries([file("2026-10-01-0630", "Old"), file("2026-10-02-0630", "New")]),
    );
    try {
      const notes = readNotes(vouched(brain.root), brain.root, ZONE, NOW, 5);
      expect(notes.map((n) => [n.stamp, n.note.headline])).toEqual([
        ["2026-10-02-0630", "New"],
        ["2026-10-01-0630", "Old"],
      ]);
      expect(notes[0]?.at.toISOString()).toBe("2026-10-02T05:30:00.000Z");
      expect(readNotes(vouched(brain.root), brain.root, ZONE, NOW, 1)).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("is empty when the folder does not exist yet", () => {
    const brain = makeBrain({ "README.md": "# Brain\n" });
    try {
      expect(readNotes(vouched(brain.root), brain.root, ZONE, NOW, 5)).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("never returns a corrupt, oversized, mis-named, symlinked or future-dated note", () => {
    const brain = makeBrain({
      ...Object.fromEntries([file("2026-10-02-0630", "Good")]),
      "notes/daily/2026-10-02-0600.md": "not a note",
      "notes/daily/2026-10-02-0500.md": `---\n---\n${"a".repeat(9000)}`,
      "notes/daily/draft.md": noteFileText(GOOD_NOTE),
      "notes/daily/2026-10-02-0700.md": noteFileText({ ...GOOD_NOTE, body: "Some **markdown**." }),
      ...Object.fromEntries([file("2026-10-03-0630", "Tomorrow")]),
    });
    try {
      symlinkSync(
        join(brain.root, "notes/daily/2026-10-02-0630.md"),
        join(brain.root, "notes/daily/2026-10-02-0645.md"),
      );
      expect(
        readNotes(vouched(brain.root), brain.root, ZONE, NOW, 10).map((n) => n.note.headline),
      ).toEqual(["Good"]);
    } finally {
      brain.cleanup();
    }
  });

  it("ignores a draft, even one holding a valid note: only a published note is shown", () => {
    const brain = makeBrain({
      ...Object.fromEntries([file("2026-10-02-0630", "Published")]),
      "notes/daily/2026-10-02-0645.draft.md": noteFileText({ ...GOOD_NOTE, headline: "Draft" }),
    });
    try {
      expect(
        readNotes(vouched(brain.root), brain.root, ZONE, NOW, 10).map((n) => n.note.headline),
      ).toEqual(["Published"]);
    } finally {
      brain.cleanup();
    }
  });

  it("looks at only the newest files, however many pile up", () => {
    const brain = makeBrain({});
    try {
      mkdirSync(join(brain.root, "notes/daily"), { recursive: true });
      for (let day = 1; day <= 31; day++) {
        const stamp = `2026-08-${String(day).padStart(2, "0")}-0630`;
        writeFileSync(join(brain.root, `notes/daily/${stamp}.md`), noteFileText(GOOD_NOTE));
      }
      expect(readNotes(vouched(brain.root), brain.root, ZONE, NOW, 100)).toHaveLength(30);
    } finally {
      brain.cleanup();
    }
  });

  describe("is not crowded out by files that sort above it but would never be shown", () => {
    const REAL = file("2026-10-01-0630", "Real");
    const pad = (n: number) => String(n).padStart(2, "0");
    const crowd = (root: string, stamp: (i: number) => string) => {
      mkdirSync(join(root, "notes/daily"), { recursive: true });
      for (let i = 0; i < 35; i++) {
        writeFileSync(join(root, `notes/daily/${stamp(i)}.md`), noteFileText(GOOD_NOTE));
      }
    };
    const headlines = (db: ReturnType<typeof openTestDb>, root: string) =>
      readNotes(db, root, ZONE, NOW, 5).map((n) => n.note.headline);

    it("dated ahead of the clock", () => {
      const brain = makeBrain(Object.fromEntries([REAL]));
      try {
        crowd(brain.root, (i) => `2026-12-01-${pad(i % 24)}${i < 24 ? "00" : "30"}`);
        expect(headlines(vouched(brain.root), brain.root)).toEqual(["Real"]);
      } finally {
        brain.cleanup();
      }
    });

    it("that no succeeded job vouches for", () => {
      const brain = makeBrain(Object.fromEntries([REAL]));
      try {
        crowd(brain.root, (i) => `2026-10-01-${pad(7 + (i % 17))}${i < 17 ? "00" : "30"}`);
        const db = openTestDb();
        seedNoteJob(db, "2026-10-01-0630", "ok", noteDigest(REAL[1]));
        expect(headlines(db, brain.root)).toEqual(["Real"]);
      } finally {
        brain.cleanup();
      }
    });
  });

  it("propagates a real read error instead of pretending there are no notes", () => {
    const brain = makeBrain({ "notes/daily": "this is a file, not a folder" });
    try {
      expect(() => readNotes(vouched(brain.root), brain.root, ZONE, NOW, 5)).toThrow();
    } finally {
      brain.cleanup();
    }
  });
});

describe("readNotes shows a file only while a succeeded job vouches for its bytes", () => {
  const STAMP = "2026-10-02-0630";
  const TEXT = noteFileText({ ...GOOD_NOTE, headline: "Shown" });
  type Status = "queued" | "running" | "ok" | "failed" | "cancelled";
  const read = (
    job: { status: Status; stamp?: string; result?: string | null } | null,
    fileText = TEXT,
  ) => {
    const brain = makeBrain({ [`notes/daily/${STAMP}.md`]: fileText });
    const db = openTestDb();
    if (job) {
      const result = job.result === undefined ? noteDigest(TEXT) : job.result;
      seedNoteJob(db, job.stamp ?? STAMP, job.status, result);
    }
    try {
      return readNotes(db, brain.root, ZONE, NOW, 5).map((n) => n.note.headline);
    } finally {
      brain.cleanup();
    }
  };

  it("does not show a note no job vouches for: an agent's stray file, or one typed by hand", () => {
    expect(read(null)).toEqual([]);
  });

  it("does not show a note whose job is still running, queued, failed or cancelled", () => {
    for (const status of ["running", "queued", "failed", "cancelled"] as const) {
      expect(read({ status })).toEqual([]);
    }
  });

  it("shows the note when its job has succeeded and the bytes match", () => {
    expect(read({ status: "ok" })).toEqual(["Shown"]);
  });

  it("is not vouched for by a succeeded job for another stamp", () => {
    expect(read({ status: "ok", stamp: "2026-10-01-0630" })).toEqual([]);
  });

  it("does not show a file edited by one byte after it was checked", () => {
    expect(read({ status: "ok" }, `${TEXT}.`)).toEqual([]);
    expect(read({ status: "ok" }, TEXT.replace("Shown", "Shoven"))).toEqual([]);
  });

  it("does not show a note whose job holds no digest", () => {
    expect(read({ status: "ok", result: null })).toEqual([]);
  });

  it("does not take another stamp's digest for this file", () => {
    const other = noteDigest(noteFileText({ ...GOOD_NOTE, headline: "Other" }));
    expect(read({ status: "ok", result: other })).toEqual([]);
  });

  it("does not show a stray file written after its job succeeded", () => {
    const brain = makeBrain({});
    const db = openTestDb();
    try {
      seedPublishedNote(db, brain.root, "2026-10-01-0630", GOOD_NOTE);
      writeFileSync(join(brain.root, "notes/daily/2026-10-02-0630.md"), TEXT);
      expect(readNotes(db, brain.root, ZONE, NOW, 5).map((n) => n.stamp)).toEqual([
        "2026-10-01-0630",
      ]);
    } finally {
      brain.cleanup();
    }
  });
});

describe("freshNote", () => {
  const shown = (stamp: string, at: string) => ({ stamp, at: new Date(at), note: GOOD_NOTE });

  it("is the newest note from the last 24 hours, else null", () => {
    const recent = shown("2026-10-02-0630", "2026-10-02T05:30:00Z");
    const old = shown("2026-10-01-0630", "2026-10-01T05:30:00Z");
    expect(freshNote([recent, old], NOW)).toBe(recent);
    expect(freshNote([old], NOW)).toBeNull();
    expect(freshNote([], NOW)).toBeNull();
  });

  it("counts exactly 24 hours as still fresh", () => {
    const edge = shown("2026-10-01-1000", "2026-10-01T09:00:00Z");
    expect(freshNote([edge], NOW)).toBe(edge);
  });
});
