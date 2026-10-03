import { eq } from "drizzle-orm";
import { actions, auditLog } from "@/lib/db/schema";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { actionEventsFor, insertAction, setStatus } from "../store";
import type { NewAction } from "../types";
import { DATA_NOTE } from "./format";
import { type CliDeps, runActionsCli } from "./run";

const t0 = new Date("2026-10-02T09:00:00Z");
const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com" },
  { id: "acme-blog", name: "Acme Blog", url: "https://blog.example.com" },
];
const PR = "https://github.com/acme/widget/pull/42";

/** C0 (bar newline and tab), DEL and C1 characters left in a printed output. */
function controlCharacters(text: string): string[] {
  return [...text].filter((c) => {
    const code = c.charCodeAt(0);
    return (code < 0x20 && c !== "\n" && c !== "\t") || (code >= 0x7f && code <= 0x9f);
  });
}

function setup(over: Partial<CliDeps> = {}) {
  const db = openTestDb();
  const deps: CliDeps = { db, products: PRODUCTS, timeZone: "Europe/London", now: t0, ...over };
  let rules = 0;
  const add = (action: Partial<NewAction> = {}) =>
    insertAction(db, ruleAction({ ruleKey: `rule-${++rules}`, ...action }), "scan", null, t0);
  const run = (...argv: string[]) => runActionsCli(argv, deps);
  const row = (id: number) => db.select().from(actions).where(eq(actions.id, id)).get();
  const audits = () =>
    db
      .select()
      .from(auditLog)
      .all()
      .map((e) => [e.login, e.event, e.detail]);
  return { db, add, run, row, audits };
}

describe("runActionsCli", () => {
  it("prints the usage for help, and a usage error with exit code 2", () => {
    const { run } = setup();
    expect(run("help")).toMatchObject({ code: 0, stdout: expect.stringContaining("Usage:") });
    const bad = run("set", "1", "done", "--from", "open");
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/^--note is required/);
    expect(bad.stderr).toContain("Usage:");
    expect(bad.stderr).not.toMatch(/\bat \S+:\d+/);
  });

  describe("list", () => {
    it("lists active and waiting actions of configured products, one line each", () => {
      const { db, add, run } = setup();
      const open = add({ title: "Add meta descriptions" });
      add({ status: "done", title: "Done one" });
      add({ status: "dismissed", title: "Dismissed one" });
      add({ productId: "retired-product", title: "Retired" });
      const suggested = insertAction(
        db,
        agentAction(analystJob(db), "Add an FAQ"),
        "agent",
        null,
        t0,
      );
      db.update(actions).set({ prUrl: PR }).where(eq(actions.id, open)).run();
      const { code, stdout } = run("list");
      expect(code).toBe(0);
      expect(stdout.trimEnd().split("\n")).toEqual([
        DATA_NOTE,
        `#${open}  acme-docs  SEO  open  medium/small  Add meta descriptions  [PR]`,
        `#${suggested}  acme-docs  SEO  suggested  medium/small  Add an FAQ`,
      ]);
    });

    it("filters by product and status", () => {
      const { add, run } = setup();
      add({ productId: "acme-blog", title: "Blog action" });
      const done = add({ status: "done", title: "Done one" });
      expect(run("list", "--product", "acme-blog").stdout).toContain("Blog action");
      expect(run("list", "--product", "acme-blog").stdout).not.toContain("Done one");
      const [note, ...lines] = run("list", "--status", "done").stdout.trim().split("\n");
      expect(note).toBe(DATA_NOTE);
      expect(lines).toEqual([expect.stringMatching(new RegExp(`^#${done} `))]);
    });

    it("says so when nothing matches, and refuses an unknown product", () => {
      const { run } = setup();
      expect(run("list")).toMatchObject({ code: 0, stdout: "No matching actions.\n" });
      const unknown = run("list", "--product", "acme-shop");
      expect(unknown.code).toBe(1);
      expect(unknown.stderr).toBe(
        "Unknown product: acme-shop (configured: acme-docs, acme-blog)\n",
      );
    });

    it("prints full rows as JSON", () => {
      const { add, run } = setup();
      const id = add({ status: "snoozed", snoozedUntil: "2026-10-09" });
      const printed = JSON.parse(run("list", "--json").stdout);
      expect(printed.note).toBe(DATA_NOTE);
      expect(printed.actions).toEqual([
        {
          id,
          productId: "acme-docs",
          area: "SEO",
          title: "Add meta descriptions",
          why: "Pages without a description get a generated snippet.",
          fix: "Write a one-sentence description for each page.",
          check: "Every page has a meta description.",
          impact: "medium",
          effort: "small",
          evidence: {
            items: [{ text: "https://example.com/a", url: "https://example.com/a" }],
            total: 1,
          },
          docs: [],
          source: "rule",
          status: "snoozed",
          snoozedUntil: "2026-10-09",
          prUrl: null,
          stage: null,
          createdAt: t0.toISOString(),
          statusChangedAt: t0.toISOString(),
        },
      ]);
    });
  });

  it("strips escape sequences and control characters from every printed field", () => {
    const { add, run } = setup();
    const id = add({
      title: "Fix \u001b[31mred\u001b[0m\u0007 title\nStatus: done",
      why: "Why\u009b2J\u0000 it\tmatters",
      evidence: { items: [{ text: "page \u001b]0;x\u0007one", url: null }], total: 1 },
    });
    const clean = "Fix red title Status: done";
    const list = run("list").stdout;
    expect(list).toContain(`#${id}  acme-docs  SEO  open  medium/small  ${clean}\n`);
    const show = run("show", String(id)).stdout;
    expect(show).toContain(`#${id}  ${clean}\n`);
    expect(show).toContain("Why: Why it matters\n");
    expect(show).toContain("- page one");
    const json = run("list", "--json").stdout;
    expect(JSON.parse(json).actions[0]).toMatchObject({
      title: "Fix red title\nStatus: done",
      why: "Why it\tmatters",
      evidence: { items: [{ text: "page one", url: null }], total: 1 },
    });
    for (const out of [list, show, json]) {
      expect(controlCharacters(out)).toEqual([]);
      expect(out).not.toContain("\\u001b");
      expect(out).not.toContain("\\u0007");
    }
  });

  describe("show", () => {
    it("prints the fields, evidence, history and the Hand to Claude prompt", () => {
      const { add, run } = setup();
      const id = add();
      run("set", String(id), "in_progress", "--from", "open", "--note", "Fixing the templates");
      const { code, stdout } = run("show", String(id));
      expect(code).toBe(0);
      expect(stdout.split("\n")[0]).toBe(DATA_NOTE);
      for (const text of [
        `#${id}  Add meta descriptions`,
        "Product: Acme Docs (acme-docs)",
        "Status: in_progress",
        "Why: Pages without a description get a generated snippet.",
        "- https://example.com/a",
        "Scan  created as open",
        "Claude  open → in_progress  Fixing the templates",
        "Hand to Claude prompt:",
        "Fix an SEO issue on Acme Docs (https://docs.example.com)",
      ]) {
        expect(stdout).toContain(text);
      }
    });

    it("names an agent suggestion's source in the owner's words: the weekly report", () => {
      const { db, run } = setup();
      const id = insertAction(db, agentAction(analystJob(db), "Add an FAQ"), "agent", null, t0);
      expect(run("show", String(id)).stdout).toContain("Source: weekly report\n");
    });

    it("treats an action of an unconfigured product as not found", () => {
      const { add, run } = setup();
      const id = add({ productId: "retired-product" });
      expect(run("show", String(id))).toEqual({
        code: 1,
        stdout: "",
        stderr: `Action #${id} not found\n`,
      });
    });
  });

  describe("set", () => {
    it("changes the status as Claude, with the note in history and not in the audit", () => {
      const { db, add, run, row, audits } = setup();
      const id = add();
      const result = run("set", String(id), "done", "--from", "open", "--note", "Shipped in #42");
      expect(result).toEqual({ code: 0, stdout: `#${id} open → done\n`, stderr: "" });
      expect(row(id)?.status).toBe("done");
      expect(actionEventsFor(db, id).at(-1)).toMatchObject({
        actor: "claude",
        from: "open",
        to: "done",
        note: "Shipped in #42",
      });
      expect(audits()).toEqual([
        [
          "claude",
          "action_status_changed",
          { id, actor: "claude", from: "open", to: "done", until: null },
        ],
      ]);
      expect(JSON.stringify(audits())).not.toContain("Shipped");
    });

    it("refuses a stale --from without overwriting", () => {
      const { db, add, run, row, audits } = setup();
      const id = add();
      setStatus(db, id, "open", "in_progress", { actor: "owner", now: t0 });
      const result = run("set", String(id), "dismissed", "--from", "open", "--note", "Not needed");
      expect(result.code).toBe(1);
      expect(result.stderr).toBe(
        `Action #${id} is no longer open: run "pnpm actions show ${id}" and decide again\n`,
      );
      expect(row(id)?.status).toBe("in_progress");
      expect(audits()).toEqual([]);
    });

    it("refuses a move the status does not allow, and a snooze without a date", () => {
      const { add, run } = setup();
      const done = add({ status: "done" });
      expect(run("set", String(done), "in_progress", "--from", "done", "--note", "x").stderr).toBe(
        `Cannot move action #${done} from done to in_progress\n`,
      );
      const open = add();
      expect(run("set", String(open), "snoozed", "--from", "open", "--note", "x").stderr).toBe(
        "Snoozing needs --until YYYY-MM-DD\n",
      );
    });

    it("snoozes until a date after today in HARBOUR_TIMEZONE", () => {
      // 23:30 UTC on 2 October is already 3 October in Auckland.
      const now = new Date("2026-10-02T23:30:00Z");
      const { add, run, row } = setup({ now, timeZone: "Pacific/Auckland" });
      const id = add();
      const today = run(
        "set",
        String(id),
        "snoozed",
        "--from",
        "open",
        "--note",
        "x",
        "--until",
        "2026-10-03",
      );
      expect(today.code).toBe(1);
      expect(today.stderr).toBe(
        "--until must be a real YYYY-MM-DD date after today (2026-10-03) and at most 365 days ahead\n",
      );
      const malformed = run(
        "set",
        String(id),
        "snoozed",
        "--from",
        "open",
        "--note",
        "x",
        "--until",
        "next week",
      );
      expect(malformed.code).toBe(1);
      expect(malformed.stderr).toMatch(/^--until must be a real YYYY-MM-DD date/);
      const later = run(
        "set",
        String(id),
        "snoozed",
        "--from",
        "open",
        "--note",
        "x",
        "--until",
        "2026-10-04",
      );
      expect(later.stdout).toBe(`#${id} open → snoozed until 2026-10-04\n`);
      expect(row(id)).toMatchObject({ status: "snoozed", snoozedUntil: "2026-10-04" });
    });

    it("treats a missing action as not found", () => {
      const { run } = setup();
      expect(run("set", "99", "done", "--from", "open", "--note", "x")).toMatchObject({
        code: 1,
        stderr: "Action #99 not found\n",
      });
    });
  });

  describe("link", () => {
    it("links and clears a pull request", () => {
      const { add, run, row } = setup();
      const id = add();
      expect(run("link", String(id), `${PR}/`).stdout).toBe(`#${id} linked to ${PR}\n`);
      expect(row(id)?.prUrl).toBe(PR);
      expect(run("link", String(id), "--clear").stdout).toBe(`#${id} pull request link cleared\n`);
      expect(row(id)?.prUrl).toBeNull();
    });

    it.each([
      ["another host", "https://example.com/acme/widget/pull/42"],
      ["a query string", `${PR}?tab=files`],
    ])("refuses %s", (_label, url) => {
      const { add, run, row } = setup();
      const id = add();
      const result = run("link", String(id), url);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe(
        "Not a GitHub pull request URL: expected https://github.com/<owner>/<repo>/pull/<number>\n",
      );
      expect(row(id)?.prUrl).toBeNull();
    });
  });
});
