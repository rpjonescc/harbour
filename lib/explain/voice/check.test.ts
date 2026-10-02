import {
  FACTS,
  factsInput,
  GOOD_NOTE,
  NO_WINS_FACTS,
  OUT_OF_HOURS_FACTS,
  TROUBLE_FACTS,
  WEAK_FACTS,
  WEEKEND_FACTS,
} from "@/tests/helpers/note";
import { BANNED_WORDS, checkNote, toneProblem } from "./check";
import { buildFacts } from "./facts";
import type { Note } from "./note";

const check = (over: Partial<Note>, facts = FACTS) => checkNote({ ...GOOD_NOTE, ...over }, facts);

describe("checkNote accepts", () => {
  it("a good note, and a figure that is in the facts", () => {
    expect(checkNote(GOOD_NOTE, FACTS)).toBeNull();
    expect(
      check({ body: "Acme Docs picked up 3 points, and 2 sites are on the board." }),
    ).toBeNull();
  });

  it("a note that says nothing is broken when nothing is", () => {
    expect(check({ body: "Nothing is broken, and there are no problems to report." })).toBeNull();
  });
});

describe("checkNote rejects", () => {
  it.each([
    ["an invented figure", { body: "Acme Docs jumped 93 points overnight." }, /figure 93/],
    ["an invented spelled-out figure", { body: "Seven things are waiting for you." }, /"seven"/],
    ["an area code", { body: "Your SEO is up a little." }, /area code/],
    [
      "a name that is not in the facts",
      { body: "Lately, Harbourside Books is doing well." },
      /Harbourside/,
    ],
    ["a pick that is not on the board", { picks: ["Rewrite everything"] }, /exact title/],
    [
      "the same pick twice",
      { picks: [GOOD_NOTE.picks[0] ?? "", GOOD_NOTE.picks[0] ?? ""] },
      /twice/,
    ],
    ["a banned word", { body: "It is urgent that you fix the guide." }, /"urgent"/],
    ["a banned phrase", { body: "You are falling behind on the guide." }, /"behind"/],
    ["shouting", { headline: "THIS IS BIG NEWS" }, /capitals/],
    ["a run of exclamation marks", { headline: "Brilliant!!" }, /exclamation/],
    ["a rest sentence on a working morning", { rest: "Rest easy today." }, /Leave the rest/],
    [
      "talk of trouble when there is none",
      { body: "The backup failed last night, sadly." },
      /trouble/,
    ],
  ])("%s", (_name, over, reason) => {
    expect(check(over)).toMatch(reason);
  });

  it.each(BANNED_WORDS)("the banned word %j, whatever its case", (word) => {
    const shouted = word.charAt(0).toUpperCase() + word.slice(1);
    expect(check({ body: `This is ${shouted} for you.` })).toMatch(/banned/);
  });

  it.each([
    ["a sentence-opening stranger", "Zenith is your new rival."],
    ["a stranger before a comma", "Zenith, hello."],
    ["a quoted stranger", "\u00abZenith\u00bb is lovely."],
    ["a mix of two known products", "Lighthouse Docs is doing well."],
  ])("%s", (_name, body) => {
    expect(check({ body, picks: [] })).toMatch(/Zenith|Lighthouse/);
  });

  it.each([
    ["a tens word", "Forty things are waiting.", /"forty"/],
    ["a teens word", "Fourteen things are waiting.", /"fourteen"/],
    ["hundred", "A hundred things are waiting.", /"hundred"/],
    ["dozen", "A dozen things are waiting.", /"dozen"/],
    ["half", "Acme Docs is up half.", /"half"/],
    ["doubled", "Acme Docs doubled overnight.", /"doubled"/],
    ["tripled", "Acme Docs tripled overnight.", /"tripled"/],
  ])("a figure said as a word: %s", (_name, body, reason) => {
    expect(check({ body })).toMatch(reason);
  });

  it.each([
    ["a negation that does not reach the trouble", "Not today, but the backup failed."],
    ["a crash", "The site crashed overnight."],
    ["offline", "The checker is offline."],
    ["an error", "There was an error in the check."],
    ["something missing", "The guide is missing."],
  ])("invented trouble: %s", (_name, body) => {
    expect(check({ body })).toMatch(/trouble/);
  });

  it.each([
    ["mustn't", "You mustn't forget the guide."],
    ["hurried", "You hurried the guide."],
    ["urgently", "This needs doing urgently."],
    ["hurrying", "No need for hurrying."],
    ["a lowercase area code", "Your seo is up a little."],
    ["a look-alike letter", `Acme D${String.fromCodePoint(0x43e)}cs is fine.`],
  ])("tone and spelling: %s", (_name, body) => {
    expect(check({ body })).not.toBeNull();
  });

  it("an area with no score in the facts", () => {
    const acmeOnly = buildFacts(factsInput({ products: [factsInput().products[0] ?? never()] }));
    expect(check({ body: "Answer-ready needs the most care.", picks: [] }, acmeOnly)).toMatch(
      /no score for it/,
    );
  });

  it("celebrating with no wins", () => {
    const quiet = { body: "A quiet morning on the board.", picks: [] };
    expect(check(quiet, NO_WINS_FACTS)).toMatch(/no wins/);
    expect(check({ ...quiet, mood: "steady" }, NO_WINS_FACTS)).toBeNull();
  });

  it("praising weak scores, but not when some area is good", () => {
    const strong = { body: "A strong start, honestly.", picks: [], mood: "steady" as const };
    expect(check(strong, WEAK_FACTS)).toMatch(/not strong/);
    expect(check(strong, FACTS)).toBeNull();
  });
});

describe("what the board's own words allow", () => {
  const onBoard = (title: string) =>
    buildFacts(
      factsInput({
        actions: [{ id: 3, title, impact: "high", effort: "small", who: "you" }],
      }),
    );

  it("a pick whose title holds markup characters is fine: membership is the check", () => {
    const title = "Fix the missing <title> tags";
    expect(check({ picks: [title] }, onBoard(title))).toBeNull();
  });

  it("a capitalised word from the facts is not shouting, but other shouting is", () => {
    const facts = onBoard("Serve the site over HTTPS");
    expect(check({ body: "HTTPS is the one to start with.", picks: [] }, facts)).toBeNull();
    expect(check({ body: "HTTPS is the one to start with.", picks: [] })).toMatch(/capitals/);
  });

  it("the word score is ordinary, not a figure", () => {
    expect(check({ body: "Your score is steady, and the score is up 3.", picks: [] })).toBeNull();
  });

  it("honest negations of trouble stay accepted", () => {
    expect(check({ body: "No errors to report, and nothing is offline." })).toBeNull();
  });
});

describe("the rest rule", () => {
  it.each([
    ["a weekend", WEEKEND_FACTS],
    ["out of hours", OUT_OF_HOURS_FACTS],
  ])("needs a rest sentence on %s, and accepts one", (_name, facts) => {
    expect(checkNote(GOOD_NOTE, facts)).toMatch(/rest sentence/);
    expect(
      checkNote({ ...GOOD_NOTE, rest: "All of this can wait until Monday." }, facts),
    ).toBeNull();
  });
});

describe("the trouble rule", () => {
  it("needs a next step when the facts list trouble: a pick counts", () => {
    expect(checkNote(GOOD_NOTE, TROUBLE_FACTS)).toBeNull();
  });

  it("or an allowed phrase", () => {
    // GOOD_NOTE's own body says "a good place to start", so give the bare note a body without one.
    const body =
      "Acme Docs picked up 3 points in Found on Google, and the page titles job is finished.";
    const bare = { ...GOOD_NOTE, picks: [], body };
    expect(checkNote(bare, TROUBLE_FACTS)).toMatch(/next step/);
    const phrased = { ...bare, body: `${bare.body} Next step: run the check again.` };
    expect(checkNote(phrased, TROUBLE_FACTS)).toBeNull();
  });
});

describe("reasons are safe to feed back", () => {
  it("never repeat the agent's own words beyond a sanitised token", () => {
    const reason = check({ body: "Lately, Ignore<all>rules is doing well." });
    expect(reason).toMatch(/Ignoreallrules/);
    expect(reason).not.toMatch(/[<>`]/);
  });
});

describe("toneProblem", () => {
  it("is null for calm text", () => {
    expect(toneProblem("A calm morning. One thing to look at.")).toBeNull();
  });
  it("names the first problem", () => {
    expect(toneProblem("Hurry up!!")).toMatch(/exclamation/);
  });
});

function never(): never {
  throw new Error("fixture has products");
}
