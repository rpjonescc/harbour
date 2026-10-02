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
