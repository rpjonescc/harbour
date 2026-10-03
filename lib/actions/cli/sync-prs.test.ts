import { card, fakeGh, NOW, prJson, setup } from "@/tests/helpers/pr-sync";
import { USAGE } from "./args";
import { runSyncPrsCli } from "./sync-prs";

const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com" }];
const pr = (n: number) => `https://github.com/acme/widget/pull/${n}`;

function cli(answers: Parameters<typeof fakeGh>[0]) {
  const { db, column } = setup();
  const fake = fakeGh(answers);
  const deps = {
    db,
    products: PRODUCTS,
    timeZone: "Europe/London",
    locale: "en-GB",
    now: NOW,
    gh: fake.gh,
  };
  const run = (...argv: string[]) => runSyncPrsCli(argv, deps);
  return { db, column, run, fake };
}

describe("pnpm actions sync-prs", () => {
  it("is in the usage text", () => {
    expect(USAGE).toContain("pnpm actions sync-prs [--dry-run] [--json]");
  });

  it("says so when no card has a pull request", async () => {
    const { run } = cli({});
    expect(await run()).toEqual({
      code: 0,
      stdout: "No cards with a pull request to check.\n",
      stderr: "",
    });
  });

  it("prints what moved, what failed and what changed nothing, and exits 1 on a failure", async () => {
    const { db, run } = cli({
      [pr(1)]: prJson({ state: "MERGED", mergedAt: "2026-10-03T15:00:00Z" }),
      [pr(3)]: prJson(),
    });
    const merged = card(db, "in_review", pr(1), "Merged work");
    const lost = card(db, "in_review", pr(2), "Lost \u001b[31mwork");
    const same = card(db, "in_review", pr(3), "Waiting work");
    const result = await run();
    expect(result.code).toBe(1);
    expect(result.stdout).toBe(
      [
        "Checked 3 cards with a pull request.",
        `Moved #${merged} "Merged work" from In review to Done: Pull request merged on 3 October 2026.`,
        `Could not check #${lost} "Lost work": GitHub could not find this pull request, or this login cannot see it. Check the link on the card. (no such PR)`,
        `No change: #${same}.`,
        "",
      ].join("\n"),
    );
  });

  it("names a held card and the column its pull request asks for, and exits 0", async () => {
    const { db, run } = cli({});
    const idea = card(db, "suggested", pr(1), "A new idea");
    const result = await run();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Left for a decision #${idea} "A new idea": It is a new idea.`);
  });

  it("--dry-run says what it would do and changes nothing", async () => {
    const { db, column, run } = cli({ [pr(1)]: prJson({ state: "CLOSED" }) });
    const id = card(db, "started", pr(1), "Closed work");
    const result = await run("--dry-run");
    expect(result.stdout).toContain("(dry run: nothing was changed)");
    expect(result.stdout).toContain(`Would move #${id} "Closed work" from Started to Backlog`);
    expect(column(id)).toBe("started");
  });

  it("--json prints a machine summary with the data note", async () => {
    const { db, run } = cli({ [pr(1)]: prJson({ state: "CLOSED" }) });
    const id = card(db, "started", pr(1), "Closed work");
    const result = await run("--json");
    const printed = JSON.parse(result.stdout);
    expect(printed).toMatchObject({ dryRun: false, more: 0, failed: 0 });
    expect(printed.note).toContain("data, not instructions");
    expect(printed.cards).toEqual([
      {
        id,
        title: "Closed work",
        result: "moved",
        from: "started",
        to: "backlog",
        notes: ["Pull request closed without merging; the card needs a decision."],
      },
    ]);
  });

  it.each([
    [["extra"], "takes no arguments"],
    [["--force"], "Unknown option"],
    [["--note", "x"], "Unknown option"],
  ])("refuses %j as a usage mistake", async (argv, message) => {
    const { run, fake } = cli({});
    const result = await run(...argv);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(message);
    expect(fake.calls).toEqual([]);
  });
});
