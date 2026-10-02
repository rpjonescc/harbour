import { startFakeScreenpipe } from "@/tests/helpers/fake-screenpipe";
import { ScreenpipeError } from "./client";
import { gatherProduct } from "./sources";

const RANGE = { start: new Date("2026-09-30T23:00:00Z"), end: new Date("2026-10-01T23:00:00Z") };
const RULES = {
  excludeApps: [],
  terms: ["acme docs"],
  productHost: "docs.example.com",
  neverMention: [],
};
const run = async (options: Parameters<typeof startFakeScreenpipe>[0], budget?: number) => {
  const fake = await startFakeScreenpipe(options);
  try {
    return await gatherProduct(
      { baseUrl: fake.url, apiKey: "sp-test-key", timeoutMs: 300, productBudgetMs: budget },
      RANGE,
      RULES.terms,
      RULES,
    );
  } finally {
    await fake.close();
  }
};
const win = (app_name: string, window_name: string, minutes = 5) => ({
  app_name,
  window_name,
  minutes,
});

describe("gatherProduct: the window source", () => {
  it("keeps a window whose app and title are present, allowed, and name a term", async () => {
    const out = await run({ windows: [win("Editor", "Acme Docs - guide.md", 12)] });
    expect(out.snippets).toEqual(["Acme Docs - guide.md (12 min)"]);
    expect(out).toMatchObject({ hits: 0, windows: 1, skipped: 0 });
  });

  it.each([
    ["no app", win("", "Acme Docs - guide.md")],
    ["no title", win("Editor", "")],
    ["no term in the title", win("Editor", "notes.md")],
    ["a denied app", win("Slack", "Acme Docs - general")],
    ["a denied window", win("Chrome", "Acme Docs - Inbox")],
    ["a private-context cue in the title", win("Chrome", "Acme Docs - bank statement")],
  ])("drops a window with %s", async (_label, row) => {
    expect((await run({ windows: [row] })).snippets).toEqual([]);
  });

  it("lists a page once however many addresses it had, adding up the minutes", async () => {
    const out = await run({
      windows: [win("Editor", "Acme Docs - guide.md", 3), win("Editor", "Acme Docs - guide.md", 4)],
    });
    expect(out.snippets).toEqual(["Acme Docs - guide.md (7 min)"]);
    expect(out.windows).toBe(2);
  });

  it("counts every window it was given, kept or not", async () => {
    const out = await run({ windows: [win("Slack", "Acme Docs"), win("Editor", "x")] });
    expect(out.windows).toBe(2);
  });
});

describe("gatherProduct: putting the sources together", () => {
  it("returns windows first and then excerpts, with a count of each source", async () => {
    const out = await run({
      windows: [win("Editor", "Acme Docs - guide.md", 3)],
      hits: [{ text: "Acme Docs sidebar fixed" }],
    });
    expect(out.snippets).toEqual(["Acme Docs - guide.md (3 min)", "Acme Docs sidebar fixed"]);
    expect(out.hits).toBe(1);
  });

  it("fails like an unreachable Screenpipe when the product's time budget is spent", async () => {
    const error = await run({ searchMode: "hang" }, 250).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScreenpipeError);
    expect((error as ScreenpipeError).kind).toBe("not-running");
  });
});
