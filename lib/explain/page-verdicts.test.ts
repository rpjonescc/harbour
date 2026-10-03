import { agentsVerdict, type VerdictRun } from "./agents";
import { targetsVerdict } from "./approvals";
import { actionsVerdict, type BoardVerdictFacts } from "./board-verdict";
import { type BrainFacts, brainVerdict } from "./brain-page";
import { type ContentCounts, contentVerdict } from "./content";
import { devicesVerdict } from "./devices";
import { count, sentences } from "./page-verdict";
import { productVerdict } from "./product-summary";
import { type SettingsFacts, settingsVerdict } from "./settings";
import { type SourcesVerdictProduct, sourcesVerdict } from "./sources-page";

const run = (status: VerdictRun["status"], doing = "checking Acme Docs"): VerdictRun => ({
  status,
  doing,
});

describe("page verdict helpers", () => {
  it("counts in the singular and plural, and skips missing sentences", () => {
    expect(count(1, "note")).toBe("1 note");
    expect(count(3, "note")).toBe("3 notes");
    expect(sentences("One.", null, false, "Two.")).toBe("One. Two.");
  });
});

describe("agentsVerdict", () => {
  it("says nothing is running and the last five worked", () => {
    const runs = Array.from({ length: 7 }, () => run("ok"));
    expect(agentsVerdict(runs)).toEqual({
      tone: "ok",
      text: "Nothing is running. The last 5 runs worked.",
    });
  });

  it("names what is running now and how many wait behind it", () => {
    const verdict = agentsVerdict([run("queued"), run("running"), run("ok")]);
    expect(verdict).toEqual({
      tone: "busy",
      text: "Checking Acme Docs now. 1 more run waiting. The last run worked.",
    });
  });

  it("is worth a look when a recent run didn't finish", () => {
    const verdict = agentsVerdict([run("ok"), run("failed"), run("ok")]);
    expect(verdict).toEqual({
      tone: "watch",
      text: "Nothing is running. 1 of the last 3 runs didn't finish.",
    });
    expect(agentsVerdict([run("failed")]).text).toBe(
      "Nothing is running. The last run didn't finish.",
    );
  });

  it("says when runs were stopped, and what to do before the first run", () => {
    expect(agentsVerdict([run("cancelled"), run("ok")]).text).toBe(
      "Nothing is running. The last 2 runs finished or were stopped.",
    );
    expect(agentsVerdict([])).toEqual({
      tone: "ok",
      text: "Nothing is running. No runs yet: start one with the buttons below.",
    });
    expect(agentsVerdict([run("queued"), run("queued")]).text).toContain(
      "2 runs waiting to start.",
    );
  });
});

const tabs = (over: Partial<Record<keyof ContentCounts, number>> = {}): ContentCounts => ({
  ready: 0,
  "needs-you": 0,
  ideas: 0,
  writing: 0,
  approved: 0,
  discarded: 0,
  ...over,
});

describe("contentVerdict", () => {
  it("leads with drafts ready for you, as good news rather than a problem", () => {
    expect(contentVerdict(tabs({ ready: 3, approved: 2 }))).toEqual({
      tone: "ready",
      text: "3 drafts are ready for you.",
    });
    expect(contentVerdict(tabs({ ideas: 2 })).tone).toBe("ready");
  });

  it("puts what needs a look first, worth a look, and says two things at most", () => {
    expect(contentVerdict(tabs({ "needs-you": 1, ready: 1, ideas: 4 }))).toEqual({
      tone: "watch",
      text: "1 thing needs a look from you. 1 draft is ready for you.",
    });
  });

  it("is busy while pieces are written, and calm when nothing waits", () => {
    expect(contentVerdict(tabs({ writing: 2 }))).toEqual({
      tone: "busy",
      text: "2 pieces are being written.",
    });
    expect(contentVerdict(tabs({ writing: 2, ideas: 1 }))).toEqual({
      tone: "ready",
      text: "2 pieces are being written. 1 idea is waiting for you to pick.",
    });
    expect(contentVerdict(tabs({ approved: 5 })).tone).toBe("ok");
    expect(contentVerdict(tabs()).text).toMatch(/^Nothing is waiting for you\./);
  });
});

const product = (over: Partial<SourcesVerdictProduct> = {}): SourcesVerdictProduct => ({
  name: "Acme Docs",
  checking: false,
  checked: true,
  failed: [],
  ...over,
});

describe("sourcesVerdict", () => {
  it("says every connected source answered", () => {
    expect(sourcesVerdict([product()])).toEqual({
      tone: "ok",
      text: "Every connected data source answered at the last check.",
    });
  });

  it("names the one source that didn't answer, or counts several", () => {
    expect(sourcesVerdict([product({ failed: ["pagespeed"] })])).toEqual({
      tone: "watch",
      text: "Google speed test (PageSpeed) didn't answer at the last check. Harbour tries again at the next check.",
    });
    const two = sourcesVerdict([
      product({ failed: ["pagespeed"] }),
      product({ name: "Fern & Field", failed: ["crawl"] }),
    ]);
    expect(two.text).toMatch(/^2 data sources didn't answer/);
  });

  it("says what is being checked and what hasn't been checked yet", () => {
    const verdict = sourcesVerdict([
      product({ checking: true }),
      product({ name: "Fern & Field", checked: false }),
    ]);
    expect(verdict).toEqual({
      tone: "busy",
      text: "Every connected data source answered at the last check. Checking Acme Docs now. Fern & Field hasn't been checked yet.",
    });
    expect(sourcesVerdict([product({ checked: false })])).toEqual({
      tone: "unknown",
      text: "Nothing has been checked yet. Choose Check now on a product's page.",
    });
  });
});

const facts = (over: Partial<SettingsFacts> = {}): SettingsFacts => ({
  demo: false,
  backup: "ok",
  claudeConnected: true,
  brokenKeyFiles: [],
  budgetReached: false,
  optionalMissing: 0,
  awaitingApproval: 0,
  ...over,
});

describe("settingsVerdict", () => {
  it("says everything is set up, with optional connections counted", () => {
    expect(settingsVerdict(facts())).toEqual({ tone: "ok", text: "Everything is set up." });
    expect(settingsVerdict(facts({ optionalMissing: 2 })).text).toBe(
      "Everything is set up. 2 optional connections aren't set up.",
    );
  });

  it("names the one thing missing, most important first", () => {
    expect(settingsVerdict(facts({ backup: "failed", claudeConnected: false }))).toEqual({
      tone: "act",
      text: "The last backup didn't finish.",
    });
    expect(settingsVerdict(facts({ claudeConnected: false })).text).toBe(
      "Claude isn't connected yet, so agents and drafts can't run.",
    );
    expect(settingsVerdict(facts({ brokenKeyFiles: ["Search Console"] })).text).toBe(
      "The Search Console key file can't be found.",
    );
    expect(settingsVerdict(facts({ demo: true })).text).toMatch(/example products/);
    expect(settingsVerdict(facts({ budgetReached: true })).tone).toBe("watch");
  });

  it("adds research targets waiting for your OK", () => {
    expect(settingsVerdict(facts({ awaitingApproval: 2 })).text).toBe(
      "Everything is set up. 2 research targets waiting for your OK (under More settings).",
    );
  });
});

const brain = (over: Partial<BrainFacts> = {}): BrainFacts => ({
  notes: 17,
  fresh: 0,
  lastChanged: "4 min ago",
  unsaved: 0,
  unpushed: 0,
  syncFailed: false,
  recovering: false,
  ...over,
});

describe("brainVerdict", () => {
  it("counts the notes, says when one changed and that all is saved", () => {
    expect(brainVerdict(brain({ fresh: 3 }))).toEqual({
      tone: "ok",
      text: "17 notes, the newest changed 4 min ago. Everything is saved and synced. 3 are new to you.",
    });
  });

  it("says synced only when every saved change has reached GitHub", () => {
    for (const unpushed of [2, null]) {
      expect(brainVerdict(brain({ unpushed })).text).toBe(
        "17 notes, the newest changed 4 min ago. Everything is saved.",
      );
    }
  });

  it("says what isn't saved, and never reads a failed check as saved", () => {
    expect(brainVerdict(brain({ unsaved: 2 })).text).toContain(
      "2 changes will be saved automatically soon.",
    );
    expect(brainVerdict(brain({ syncFailed: true }))).toMatchObject({ tone: "watch" });
    expect(brainVerdict(brain({ recovering: true })).text).toContain("Saving is paused");
    expect(brainVerdict(brain({ unsaved: null })).text).toBe(
      "17 notes, the newest changed 4 min ago.",
    );
  });

  it("says what to do when there are no notes", () => {
    expect(brainVerdict(brain({ notes: 0 })).tone).toBe("unknown");
  });
});

describe("devicesVerdict", () => {
  it("nudges for a second device when only one can sign in", () => {
    expect(devicesVerdict([{ current: true }]).text).toMatch(/^1 device can open Harbour\. Add/);
    expect(devicesVerdict([{ current: true }, { current: false }]).text).toBe(
      "2 devices can open Harbour, including this one.",
    );
    expect(devicesVerdict([]).tone).toBe("unknown");
  });
});

describe("targetsVerdict", () => {
  it("says how many targets wait for your OK, or that none do", () => {
    expect(targetsVerdict("Acme Docs", 2, 1)).toEqual({
      tone: "watch",
      text: "2 research targets waiting for your OK.",
    });
    expect(targetsVerdict("Acme Docs", 0, 1)).toEqual({
      tone: "ok",
      text: "Nothing for Acme Docs is waiting for your OK. 1 target approved.",
    });
  });
});

describe("productVerdict", () => {
  const totals = { seo: 66, geo: 83, aeo: 58 };
  it("uses the product summary, busy while a check runs", () => {
    expect(productVerdict("Acme Docs", totals, false)).toEqual({
      tone: "ok",
      text: "Acme Docs is in fair shape. Weakest: Answer-ready (fair).",
    });
    expect(productVerdict("Acme Docs", totals, true).tone).toBe("busy");
  });

  it("is worth a look when the product needs work, and can't tell before a score", () => {
    expect(productVerdict("Acme Docs", { seo: 30, geo: 40, aeo: 20 }, false).tone).toBe("watch");
    expect(productVerdict("Acme Docs", null, false).tone).toBe("unknown");
  });
});

describe("actionsVerdict", () => {
  const board = (over: Partial<BoardVerdictFacts> = {}): BoardVerdictFacts => ({
    cards: 12,
    needsYou: 0,
    newIdeas: 0,
    stuck: 0,
    ...over,
  });

  it("is calm when nothing waits, and says how many cards are on the board", () => {
    expect(actionsVerdict(board())).toEqual({
      tone: "ok",
      text: "Nothing is waiting for you. 12 cards are on the board.",
    });
  });

  it("counts the cards waiting for you, worth a look when they are more than new ideas", () => {
    expect(actionsVerdict(board({ needsYou: 2, newIdeas: 1 }))).toEqual({
      tone: "watch",
      text: "2 cards are waiting for you.",
    });
  });

  it("calls new ideas alone good news, ready for you", () => {
    expect(actionsVerdict(board({ needsYou: 1, newIdeas: 1 }))).toEqual({
      tone: "ready",
      text: "1 new idea is waiting for you.",
    });
  });

  it("says when cards have stood still, worth a look", () => {
    expect(actionsVerdict(board({ stuck: 1 }))).toEqual({
      tone: "watch",
      text: "Nothing is waiting for you. 1 card has stood still too long.",
    });
    expect(actionsVerdict(board({ needsYou: 3, newIdeas: 3, stuck: 2 })).text).toBe(
      "3 new ideas are waiting for you. 2 cards have stood still too long.",
    );
  });

  it("can't tell before the first check puts a card on the board", () => {
    expect(actionsVerdict(board({ cards: 0 })).tone).toBe("unknown");
  });
});
