import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { FACTS, GOOD_NOTE, noteFileText } from "@/tests/helpers/note";
import { noteDigest } from "./digest";
import { dailyNoteSpec, NOTE_TIMEOUT_MS, reviewNote } from "./spec";

const STAMP = "2026-10-02-0630";
const PATH = `notes/daily/${STAMP}.md`;
const DRAFT = `notes/daily/${STAMP}.draft.md`;
const context = { products: [], today: "2026-10-02", noteFacts: () => FACTS };

describe("dailyNoteSpec", () => {
  it("allows exactly one file, gives the agent only Write, and bounds the run", () => {
    const spec = dailyNoteSpec({ stamp: STAMP }, context);
    expect(spec).toMatchObject({
      kind: "daily-note",
      label: "Daily note: 2026-10-02 06:30",
      allowed: { prefixes: [], exact: [PATH] },
      targets: [DRAFT],
      requiredOutputs: [PATH],
      requiredFiles: [],
      output: null,
      promptVersion: "warm-v1",
      tools: ["Write"],
      timeoutMs: NOTE_TIMEOUT_MS,
    });
    expect(spec.prompt).toContain(JSON.stringify(FACTS, null, 2));
  });

  it("fails clearly without facts or with a stamp that is not one", () => {
    expect(() => dailyNoteSpec({ stamp: STAMP }, { products: [], today: "x" })).toThrow(
      /facts are not available/,
    );
    expect(() => dailyNoteSpec({ stamp: "../../etc/passwd" }, context)).toThrow(
      /Invalid note stamp/,
    );
    expect(() => dailyNoteSpec({}, context)).toThrow(/Invalid note stamp/);
  });

  it("builds the retry prompt from the checker's reason", () => {
    const spec = dailyNoteSpec({ stamp: STAMP }, context);
    expect(spec.review?.retryPrompt("Because.")).toContain(
      "was rejected by Harbour's checker: Because.",
    );
  });
});

describe("reviewNote", () => {
  const review = (files: Record<string, string>, after?: (root: string) => void) => {
    const brain = makeBrain(files);
    try {
      after?.(brain.root);
      return reviewNote(brain.root, DRAFT, FACTS);
    } finally {
      brain.cleanup();
    }
  };

  it("accepts a good note", () => {
    expect(review({ [DRAFT]: noteFileText(GOOD_NOTE) })).toBeNull();
  });

  it("says when the file was not written", () => {
    expect(review({ "README.md": "x" })).toBe("The note file was not written.");
  });

  it("gives the parser's reason for a file that is not a note", () => {
    expect(review({ [DRAFT]: "hello" })).toMatch(/frontmatter/);
  });

  it("gives the checker's reason for a note that is not honest", () => {
    expect(
      review({ [DRAFT]: noteFileText({ ...GOOD_NOTE, body: "Acme Docs jumped 93 points." }) }),
    ).toMatch(/figure 93/);
  });

  it("refuses a symlink or an oversized file without reading it", () => {
    expect(
      review({ "elsewhere.md": noteFileText(GOOD_NOTE) }, (root) => {
        mkdirSync(join(root, "notes/daily"), { recursive: true });
        symlinkSync(join(root, "elsewhere.md"), join(root, DRAFT));
      }),
    ).toBe("The note file must be a regular file.");
    expect(review({ [DRAFT]: "a".repeat(9000) })).toBe("The note file is too large.");
  });

  it("propagates a real read error", () => {
    const brain = makeBrain({ "notes/daily": "a file where the folder should be" });
    try {
      expect(() => reviewNote(brain.root, DRAFT, FACTS)).toThrow();
    } finally {
      brain.cleanup();
    }
  });
});

describe("the draft and the published note", () => {
  const spec = () => dailyNoteSpec({ stamp: STAMP }, context).review;

  it("publish moves the draft to the final path, leaving no draft behind", () => {
    const brain = makeBrain({ [DRAFT]: noteFileText(GOOD_NOTE) });
    try {
      const digest = spec()?.publish(brain.root);
      expect(digest).toBe(noteDigest(noteFileText(GOOD_NOTE)));
      expect(existsSync(join(brain.root, DRAFT))).toBe(false);
      expect(readFileSync(join(brain.root, PATH), "utf8")).toBe(noteFileText(GOOD_NOTE));
    } finally {
      brain.cleanup();
    }
  });

  it("reset removes a rejected draft, and is fine when there is none", () => {
    const brain = makeBrain({ [DRAFT]: "rejected" });
    try {
      spec()?.reset(brain.root);
      spec()?.reset(brain.root);
      expect(existsSync(join(brain.root, DRAFT))).toBe(false);
    } finally {
      brain.cleanup();
    }
  });
});
