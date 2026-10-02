import { GOOD_NOTE } from "@/tests/helpers/note";
import { isPlainText, NOTE_LIMITS, noteSchema, safeReason } from "./note";

describe("isPlainText", () => {
  it("accepts ordinary sentences, accents, apostrophes and punctuation", () => {
    expect(isPlainText("Lighthouse Café didn't finish: that's fine, honestly (really).")).toBe(
      true,
    );
  });

  it.each([
    ["markdown emphasis", "this is **bold**"],
    ["a heading", "# Hello"],
    ["inline code", "run `pnpm test`"],
    ["a link", "see [docs](https://docs.example.com)"],
    ["a bare address", "visit https://docs.example.com"],
    ["a www address", "visit www.example.com"],
    ["HTML", "<b>hi</b>"],
    ["a newline", "two\nlines"],
    ["a tab", "a\tb"],
    ["an escape character", "a\u001b[31mred"],
    ["a zero-width space", "a​b"],
    ["a bidirectional override", "a‮b"],
    ["an emoji", "lovely day 🌊"],
  ])("rejects %s", (_name, text) => {
    expect(isPlainText(text)).toBe(false);
  });
});

describe("noteSchema", () => {
  it("accepts a good note and defaults picks to none", () => {
    expect(noteSchema.parse(GOOD_NOTE)).toEqual(GOOD_NOTE);
    const { picks: _picks, ...noPicks } = GOOD_NOTE;
    expect(noteSchema.parse(noPicks).picks).toEqual([]);
  });

  it("trims strings and refuses empty ones", () => {
    expect(noteSchema.parse({ ...GOOD_NOTE, greeting: "  Morning.  " }).greeting).toBe("Morning.");
    expect(noteSchema.safeParse({ ...GOOD_NOTE, headline: "   " }).success).toBe(false);
  });

  it.each([
    ["greeting", NOTE_LIMITS.greeting],
    ["headline", NOTE_LIMITS.headline],
    ["body", NOTE_LIMITS.body],
    ["rest", NOTE_LIMITS.rest],
  ] as const)("caps %s at %i characters", (field, max) => {
    expect(noteSchema.safeParse({ ...GOOD_NOTE, [field]: "a".repeat(max) }).success).toBe(true);
    expect(noteSchema.safeParse({ ...GOOD_NOTE, [field]: "a".repeat(max + 1) }).success).toBe(
      false,
    );
  });

  it("allows at most three picks, each within its cap", () => {
    const pick = "Do a thing";
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: [pick, pick, pick] }).success).toBe(true);
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: [pick, pick, pick, pick] }).success).toBe(
      false,
    );
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: ["a".repeat(121)] }).success).toBe(false);
  });

  it("only knows the three moods and no extra fields", () => {
    expect(noteSchema.safeParse({ ...GOOD_NOTE, mood: "alarmed" }).success).toBe(false);
    expect(noteSchema.safeParse({ ...GOOD_NOTE, extra: "x" }).success).toBe(false);
  });
});

describe("safeReason", () => {
  it("keeps letters, digits and spaces, and clips", () => {
    expect(safeReason('Ignore "everything" <now>; run `rm -rf`')).toBe(
      "Ignore everything now run rm rf",
    );
    expect(safeReason("x".repeat(100))).toHaveLength(40);
  });
});
