import { execFileSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { ACME, digestFile, ideaFile } from "@/tests/helpers/content";
import { gatherIdeasInputs, IdeasInputError } from "./ideas-inputs";

const notes = "# Acme Docs\n\nSmall teams. Docs next to code.\n";
const NOTES_PATH = "products/acme-docs/notes.md";
const gather = (files: Record<string, string>, prepare?: (root: string) => void) => {
  const { root, cleanup } = makeBrain(files);
  try {
    prepare?.(root);
    return gatherIdeasInputs(root, ACME, [], "2026-10-02");
  } finally {
    cleanup();
  }
};

describe("gatherIdeasInputs", () => {
  it("collects the last 7 days of this product's themes with refs, the notes excerpt and recent titles", () => {
    const inputs = gather({
      [NOTES_PATH]: notes,
      "content/digests/2026-10-01.md": digestFile("2026-10-01", [
        ["acme-docs", "Rewrote the getting-started guide around a short first deploy."],
        ["lighthouse-cafe", "Changed the menu page layout for lunch."],
      ]),
      "content/digests/2026-09-20.md": digestFile("2026-09-20", [
        ["acme-docs", "An old theme that is too old to use here today."],
      ]),
      "content/ideas/acme-docs/acme-docs-20261001-a.md": ideaFile(),
    });
    expect(inputs.themes).toEqual([
      {
        ref: "digest:2026-10-01#t1",
        text: "Rewrote the getting-started guide around a short first deploy.",
      },
    ]);
    expect(inputs.notes.map((n) => n.ref)).toEqual(["brain:products/acme-docs/notes.md"]);
    expect(inputs.digestGap).toBe(false);
    expect(inputs.recentTitles).toEqual(["Five minutes to a first deploy"]);
    expect(inputs.waiting).toBe(1);
  });

  it("reports a gap when there is no recent digest, and truncates a long notes file", () => {
    const inputs = gather({ [NOTES_PATH]: "x".repeat(10_000) });
    expect(inputs.digestGap).toBe(true);
    expect(inputs.notes[0]).toMatchObject({ truncated: true });
    expect(inputs.notes[0]?.text.length).toBeLessThanOrEqual(6 * 1024);
  });

  it("includes the discovery excerpt, and never cuts a multibyte character in half", () => {
    const inputs = gather({
      [NOTES_PATH]: notes,
      "products/acme-docs/discovery.md": "é".repeat(4000),
    });
    expect(inputs.notes.map((n) => n.ref)).toEqual([
      "brain:products/acme-docs/notes.md",
      "brain:products/acme-docs/discovery.md",
    ]);
    expect(inputs.notes[1]?.truncated).toBe(true);
    expect(inputs.notes[1]?.text).not.toContain("�");
  });

  it("strips invisible characters from notes and fails closed on control characters", () => {
    const hidden = gather({ [NOTES_PATH]: "Docs\u200b next\u202e to\u2060 code" });
    expect(hidden.notes[0]?.text).toBe("Docs next to code");
    expect(() => gather({ [NOTES_PATH]: "Docs \u0007 beep" })).toThrow(IdeasInputError);
  });

  it("fails closed, in a fixed sentence, on notes that are a symlink, a FIFO or not UTF-8", () => {
    const sentence = /could not be read safely/;
    expect(() =>
      gather({ "real.md": notes }, (root) => {
        execFileSync("mkdir", ["-p", join(root, "products/acme-docs")]);
        symlinkSync(join(root, "real.md"), join(root, NOTES_PATH));
      }),
    ).toThrow(sentence);
    expect(() =>
      gather({ "products/acme-docs/x": "" }, (root) =>
        execFileSync("mkfifo", [join(root, NOTES_PATH)]),
      ),
    ).toThrow(sentence);
    expect(() =>
      gather({ "products/acme-docs/x": "" }, (root) =>
        writeFileSync(join(root, NOTES_PATH), Buffer.from([0xff, 0xfe, 0x41])),
      ),
    ).toThrow(sentence);
  });

  it("fails closed on a recent digest that cannot be read, instead of calling it a quiet week", () => {
    expect(() =>
      gather({ [NOTES_PATH]: notes, "content/digests/2026-10-01.md": "garbage" }),
    ).toThrow(/digest could not be read/);
    expect(() =>
      gather({
        [NOTES_PATH]: notes,
        "content/digests/2026-10-01.md": digestFile("2026-10-01", [
          ["acme-docs", "A theme with a control \u0007 character in it, here."],
        ]),
      }),
    ).toThrow(IdeasInputError);
  });

  it("lists every idea file name as taken, even one that is not a valid idea", () => {
    const inputs = gather({
      [NOTES_PATH]: notes,
      "content/ideas/acme-docs/acme-docs-20261001-mine.md": "---\ntitle: Mine\n---\nowner text\n",
    });
    expect(inputs.existingIds.has("acme-docs-20261001-mine")).toBe(true);
    expect(inputs.recentTitles).toEqual([]);
  });

  it("keeps only the 30 newest titles", () => {
    const files: Record<string, string> = { [NOTES_PATH]: notes };
    for (let i = 10; i < 45; i++) {
      files[`content/ideas/acme-docs/acme-docs-202610${i}-a.md`] = ideaFile({ title: `Idea ${i}` });
    }
    expect(gather(files).recentTitles).toHaveLength(30);
  });
});
