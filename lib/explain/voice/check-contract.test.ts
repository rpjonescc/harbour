import { parseNoteFile } from "@/lib/note/file";
import {
  FACTS,
  factsInput,
  GOOD_NOTE,
  noteFileText,
  TROUBLE_FACTS,
  WEEKEND_FACTS,
} from "@/tests/helpers/note";
import { checkNote } from "./check";
import { buildFacts, type Facts } from "./facts";
import type { Note } from "./note";

/** The whole path an agent's file takes: parse, then check. "PASS" means it would be shown. */
function verdict(over: Partial<Note>, facts: Facts = FACTS): string {
  const note = { ...GOOD_NOTE, picks: [], mood: "steady" as const, ...over };
  const parsed = parseNoteFile(noteFileText(note));
  return parsed.ok ? (checkNote(parsed.note, facts) ?? "PASS") : parsed.reason;
}
const body = (text: string) => ({ body: text });

const DROPPED = buildFacts(
  factsInput({
    products: [
      {
        name: "Acme Docs",
        scores: { seo: 62, geo: 41, aeo: null },
        deltas: { seo: -2, geo: null, aeo: null },
        scoredLast24h: true,
      },
    ],
  }),
);

describe("honest notes are accepted", () => {
  it.each<[string, Partial<Note>, Facts?]>([
    ["Answering opener", { body: "Answering opening-hours questions in one line is a quick job." }],
    ["Hi greeting", { greeting: "Hi Sam.", body: "Both products held steady overnight." }],
    ["Meanwhile opener", body("Meanwhile, Lighthouse Café holds at 80 in Found on Google.")],
    ["Since opener", body("Since yesterday, Acme Docs is up 3 in Found on Google.")],
    ["Keep opener", body("Keep going with the small jobs, they add up.")],
    ["Try opener", body("Try the opening-hours answers first; they take minutes.")],
    ["See opener", body("See the short guide for AI assistants on the board.")],
    ["Overnight opener", body("Overnight, not much moved, which is fine.")],
    ["Yesterday's opener", body("Yesterday's finish on the page titles helps.")],
    ["Great and Nice openers", body("Great news. Nice work on Acme Docs, too.")],
    [
      "fixing the missing page titles",
      {
        mood: "celebrate",
        body: "You finished fixing the missing page titles, and Acme Docs is up 3.",
      },
    ],
    ["the word score", body("Your score is steady, and the score for Acme Docs is up 3.")],
    ["missing data", body("Acme Docs has missing data in Recommended by AI assistants.")],
    ["a reassurance", body("Nothing is broken, and there are no problems to report.")],
    ["a failed-free reassurance", body("Nothing has failed, and there was no outage.")],
    ["a went-wrong reassurance", body("Nothing went wrong overnight, which is a nice start.")],
    ["a score drop worded down 2", body("Acme Docs is down 2 in Found on Google, to 62."), DROPPED],
    [
      "a weekend note",
      {
        body: "Acme Docs sits at 62 in Found on Google. Nothing needs you today.",
        rest: "Wind down: everything on the board can wait until Monday.",
      },
      WEEKEND_FACTS,
    ],
    [
      "a trouble note",
      {
        mood: "attention",
        body: "The last check for Lighthouse Café didn't finish, so its scores are from before. Next step: run it again.",
      },
      TROUBLE_FACTS,
    ],
  ])("%s", (_name, over, facts) => {
    expect(verdict(over, facts)).toBe("PASS");
  });
});

describe("bypasses are rejected", () => {
  it.each([
    ["guillemets", "The «Zenith» site is ahead."],
    ["low quotes", "The „Zenith“ site is ahead."],
    ["single angle quotes", "The ‹Zenith› site is ahead."],
    ["corner brackets", "The 「Zenith」 site is ahead."],
    ["a mid-sentence possessive", "The Zenith's site is ahead."],
    ["an opening possessive", "Zenith's site is ahead."],
    ["a two-word opening name", "Zenith Labs is ahead."],
    ["a bare domain", "The site acme.ai is ahead."],
    ["a .xyz domain", "See zenith.xyz today."],
    ["hundreds", "Acme Docs gained hundreds of visitors."],
    ["thousands", "Acme Docs has thousands of readers."],
    ["a million", "Acme Docs got a million visitors."],
    ["dozens", "Acme Docs gained dozens of visitors."],
    ["twice", "Acme Docs grew twice as fast."],
    ["a quarter", "Acme Docs rose by a quarter."],
    ["a -fold", "Acme Docs grew tenfold."],
    ["number one", "Acme Docs is number one on Google."],
    ["a negation that does not reach", "Not today, but the backup failed."],
    ["no doubt", "There is no doubt the backup failed."],
    ["no surprise", "No surprise the site is down."],
    ["never mind", "Never mind that Acme Docs crashed."],
    ["offline", "The checker is offline."],
    ["an ordinal rank", "Acme Docs is now third on Google."],
    ["a late ordinal", "Acme Docs climbed to twentieth place."],
    ["a digit ordinal", "Acme Docs is now 3rd on Google."],
    ["stalled", "The nightly check stalled."],
    ["timed out", "The backup timed out."],
    ["a mark inside a banned word", "Hu\u0301rry along now."],
    ["a blank braille cell inside a banned word", "Hurr\u2800y along now."],
  ])("%s", (_name, text) => {
    expect(verdict(body(text))).not.toBe("PASS");
  });
});

// Known limits: the checker is a net of word lists, not a proof. A statement made only of known
// words is not verified, so an invented cause or outside event can pass. The persona forbids
// them (rule 9); the checker cannot. These tests pin the limit so it is never mistaken for a
// guarantee.
describe("known limits: statements made only of known words", () => {
  it.each([
    ["an invented cause", "Google changed its ranking rules overnight, which explains the dip."],
    ["an invented outside event", "Acme Docs was featured by Claude yesterday."],
  ])("%s passes", (_name, text) => {
    expect(verdict(body(text))).toBe("PASS");
  });
});
