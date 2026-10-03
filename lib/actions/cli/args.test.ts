import { CliUsageError, parseCliArgs } from "./args";

const usage = (argv: string[]) => {
  try {
    parseCliArgs(argv);
  } catch (error) {
    if (error instanceof CliUsageError) return error.message;
    throw error;
  }
  throw new Error("expected a usage error");
};

describe("parseCliArgs", () => {
  it("asks for help with no command, help or --help", () => {
    expect(parseCliArgs([])).toEqual({ name: "help" });
    expect(parseCliArgs(["help"])).toEqual({ name: "help" });
    expect(parseCliArgs(["--help"])).toEqual({ name: "help" });
  });

  it("parses list with its defaults and filters", () => {
    expect(parseCliArgs(["list"])).toEqual({
      name: "list",
      productId: null,
      statuses: null,
      json: false,
    });
    expect(
      parseCliArgs(["list", "--product", "acme-docs", "--status", "open,done", "--json"]),
    ).toEqual({
      name: "list",
      productId: "acme-docs",
      statuses: ["open", "done"],
      json: true,
    });
  });

  it("refuses an unknown status, an unknown option and a stray argument for list", () => {
    expect(usage(["list", "--status", "open,lost"])).toMatch(/Unknown status: lost/);
    expect(usage(["list", "--verbose"])).toMatch(/Unknown option '--verbose'/);
    expect(usage(["list", "extra"])).toMatch(/list takes no arguments/);
    expect(usage(["list", "--note", "x"])).toMatch(/--note is not an option of list/);
  });

  it("parses show with a canonical id only", () => {
    expect(parseCliArgs(["show", "12"])).toEqual({ name: "show", id: 12 });
    for (const id of ["0", "012", "1e2", "1.0", "abc"]) {
      expect(usage(["show", id])).toMatch(/Not an action id/);
    }
    expect(usage(["show"])).toMatch(/Usage: pnpm actions show <id>/);
  });

  it("parses set with its trimmed note and snooze date", () => {
    expect(
      parseCliArgs([
        "set",
        "7",
        "snoozed",
        "--from",
        "open",
        "--note",
        "  After launch  ",
        "--until",
        "2026-10-09",
      ]),
    ).toEqual({
      name: "set",
      id: 7,
      from: "open",
      change: { to: "snoozed", note: "After launch", until: "2026-10-09" },
    });
    expect(
      parseCliArgs(["set", "7", "done", "--from", "in_progress", "--note", "Shipped"]),
    ).toEqual({
      name: "set",
      id: 7,
      from: "in_progress",
      change: { to: "done", note: "Shipped" },
    });
  });

  it("requires a reason and the status Claude last saw", () => {
    expect(usage(["set", "7", "done", "--from", "open"])).toMatch(/--note is required/);
    expect(usage(["set", "7", "done", "--from", "open", "--note", "   "])).toMatch(
      /--note is required/,
    );
    expect(usage(["set", "7", "done", "--from", "open", "--note", "x".repeat(1001)])).toMatch(
      /at most 1000 characters/,
    );
    expect(usage(["set", "7", "done", "--note", "Shipped"])).toMatch(/--from is required/);
  });

  it("refuses a bad target, a bad from and a misplaced --until", () => {
    const set = (...rest: string[]) => ["set", "7", ...rest, "--note", "Why"];
    expect(usage(set("suggested", "--from", "open"))).toMatch(/Unknown target status: suggested/);
    expect(usage(set("done", "--from", "lost"))).toMatch(/Unknown status: lost/);
    expect(usage(set("done", "--from", "open", "--until", "2026-10-09"))).toMatch(
      /--until is only for snoozed/,
    );
  });

  it("leaves checking the --until date to the status rules", () => {
    expect(
      parseCliArgs(["set", "7", "snoozed", "--from", "open", "--note", "x", "--until", "soon"]),
    ).toMatchObject({
      change: { to: "snoozed", until: "soon" },
    });
  });

  it("parses link with a URL or --clear, but not both or neither", () => {
    const url = "https://github.com/acme/widget/pull/42";
    expect(parseCliArgs(["link", "7", url])).toEqual({ name: "link", id: 7, url });
    expect(parseCliArgs(["link", "7", "--clear"])).toEqual({ name: "link", id: 7, url: null });
    expect(usage(["link", "7"])).toMatch(/Usage: pnpm actions link/);
    expect(usage(["link", "7", url, "--clear"])).toMatch(/Usage: pnpm actions link/);
  });

  it("refuses an unknown command", () => {
    expect(usage(["delete", "7"])).toMatch(/Unknown command: delete/);
  });
});

const ADD = [
  "add",
  "--product",
  "acme-docs",
  "--title",
  "Fix the Acme Docs page titles",
  "--why",
  "Pages without titles are skipped.",
  "--area",
  "SEO",
  "--impact",
  "high",
  "--effort",
  "small",
];
const withTitle = (title: string) => ADD.map((a, i) => (i === 4 ? title : a));
const withOpt = (...extra: string[]) => [...ADD, ...extra];
const without = (flag: string) => {
  const at = ADD.indexOf(flag);
  return ADD.filter((_, i) => i !== at && i !== at + 1);
};

describe("parseCliArgs add", () => {
  it("parses the required options with open as the default status", () => {
    expect(parseCliArgs(ADD)).toEqual({
      name: "add",
      input: {
        productId: "acme-docs",
        status: "open",
        title: "Fix the Acme Docs page titles",
        why: "Pages without titles are skipped.",
        fix: null,
        check: null,
        area: "SEO",
        impact: "high",
        effort: "small",
        evidence: [],
        docs: [],
      },
    });
  });

  it("parses every option, repeated --evidence and --doc, and trims", () => {
    const parsed = parseCliArgs(
      withOpt(
        "--fix",
        " Write the titles ",
        "--check",
        "Every page has one",
        "--evidence",
        "https://docs.example.com/a has none",
        "--evidence",
        "and /b",
        "--doc",
        "https://example.com/guide",
        "--doc",
        "https://example.com/other",
        "--status",
        "in_progress",
      ),
    );
    expect(parsed).toMatchObject({
      name: "add",
      input: {
        status: "in_progress",
        fix: "Write the titles",
        check: "Every page has one",
        evidence: ["https://docs.example.com/a has none", "and /b"],
        docs: ["https://example.com/guide", "https://example.com/other"],
      },
    });
  });

  it("names each missing required option", () => {
    for (const flag of ["--product", "--title", "--why"]) {
      expect(usage(without(flag))).toMatch(new RegExp(`^${flag} is required`));
    }
    for (const flag of ["--area", "--impact", "--effort"]) {
      expect(usage(without(flag))).toMatch(new RegExp(`^${flag} must be one of`));
    }
  });

  it("refuses bad enums, however they are cased", () => {
    expect(usage(withOpt("--area", "seo"))).toMatch(/--area must be one of: SEO, GEO, AEO/);
    expect(usage(withOpt("--impact", "huge"))).toMatch(/--impact must be one of/);
    expect(usage(withOpt("--effort", "tiny"))).toMatch(/--effort must be one of/);
    expect(usage(withOpt("--status", "done"))).toMatch(/--status must be one of: suggested/);
    expect(usage(withOpt("--status", "open,suggested"))).toMatch(/--status must be one of/);
  });

  it("enforces the length limits at their edges", () => {
    const over = (flag: string, n: number, base = "x") => withOpt(flag, base.repeat(n));
    expect(usage(withOpt("--title", "short"))).toMatch(/--title must be 8 to 140/);
    expect(usage(over("--title", 141, "a"))).toMatch(/--title must be 8 to 140/);
    expect(usage(withOpt("--why", "too short"))).toMatch(/--why must be 10 to 600/);
    expect(usage(over("--why", 601))).toMatch(/--why must be 10 to 600/);
    expect(usage(over("--fix", 601))).toMatch(/--fix must be at most 600/);
    expect(usage(over("--check", 601))).toMatch(/--check must be at most 600/);
    expect(usage(withOpt("--fix", "  "))).toMatch(/--fix must not be empty/);
    expect(usage(over("--evidence", 301))).toMatch(/Each --evidence must be 1 to 300/);
    expect(usage(withOpt("--evidence", " "))).toMatch(/Each --evidence must be 1 to 300/);
    const edge = parseCliArgs(withTitle("a".repeat(140)));
    expect(edge).toMatchObject({ input: { title: "a".repeat(140) } });
    expect(
      parseCliArgs(withOpt("--fix", "y".repeat(600), "--evidence", "e".repeat(300))),
    ).toMatchObject({
      name: "add",
    });
  });

  it("allows 8 evidence lines and 8 docs, not 9", () => {
    const many = (flag: string, make: (i: number) => string, n: number) =>
      Array.from({ length: n }, (_, i) => [flag, make(i)]).flat();
    const doc = (i: number) => `https://example.com/${i}`;
    expect(parseCliArgs(withOpt(...many("--evidence", String, 8)))).toMatchObject({ name: "add" });
    expect(usage(withOpt(...many("--evidence", String, 9)))).toMatch(/At most 8 --evidence/);
    expect(parseCliArgs(withOpt(...many("--doc", doc, 8)))).toMatchObject({ name: "add" });
    expect(usage(withOpt(...many("--doc", doc, 9)))).toMatch(/At most 8 --doc/);
  });

  it("takes https docs only, without credentials", () => {
    for (const bad of [
      "http://example.com/a",
      "ftp://example.com/a",
      "javascript:alert(1)",
      "example.com/a",
      "https://user:pw@example.com/a",
      "https://",
      "research/seo/meta.md",
    ]) {
      expect(usage(withOpt("--doc", bad))).toMatch(/--doc must be an https:\/\/ link/);
    }
  });

  it("refuses control and hidden characters, and newlines in a title or evidence line", () => {
    const hostile = [
      "\u001b[31mred",
      "bell\u0007here",
      "nul\u0000here",
      "c1\u009bhere",
      "zero\u200bwidth",
      "bidi\u202eevil",
      "tag\u{e0041}here",
      "soft\u00adhyphen",
      "joiner\u2060here",
      "tab\there",
      "cr\rhere",
    ];
    for (const text of hostile) {
      const padded = `Plain words ${text} more`;
      for (const flag of ["--title", "--why", "--fix", "--check", "--evidence"]) {
        const argv = flag === "--title" ? withTitle(padded) : withOpt(flag, padded);
        expect(usage(argv), `${flag} ${JSON.stringify(text)}`).toMatch(/plain text/);
      }
      expect(usage(withOpt("--doc", `https://example.com/${text}`))).toMatch(/plain text/);
    }
    expect(usage(withTitle("Two\nlines here"))).toMatch(
      /--title must be plain text without newlines/,
    );
    expect(usage(withOpt("--evidence", "two\nlines"))).toMatch(/--evidence must be plain text/);
    expect(parseCliArgs(withOpt("--why", "First line here.\nSecond line here."))).toMatchObject({
      input: { why: "First line here.\nSecond line here." },
    });
  });

  it("refuses a title with nothing to compare, and foreign options and arguments", () => {
    expect(usage(withTitle("!!!!!!!!!!"))).toMatch(/--title must contain letters or numbers/);
    expect(usage(withOpt("--json"))).toMatch(/--json is not an option of add/);
    expect(usage(["list", "--title", "x"])).toMatch(/--title is not an option of list/);
    expect(usage(["show", "1", "--doc", "https://example.com"])).toMatch(/not an option of show/);
    expect(usage([...ADD, "stray"])).toMatch(/add takes no arguments/);
  });
});
