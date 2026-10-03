import { eq } from "drizzle-orm";
import { actions, auditLog } from "@/lib/db/schema";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { actionEventsFor, insertAction } from "../store";
import { NO_CHECK, NO_FIX } from "./add";
import { DATA_NOTE } from "./format";
import { type CliDeps, runActionsCli } from "./run";

const t0 = new Date("2026-10-02T09:00:00Z");
const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com" },
  { id: "acme-blog", name: "Acme Blog", url: "https://blog.example.com" },
];
const BASE = [
  "add",
  "--product",
  "acme-docs",
  "--title",
  "Hand the page titles to the docs owner",
  "--why",
  "The owner session needs a tracked item for this hand-off.",
  "--area",
  "SEO",
  "--impact",
  "high",
  "--effort",
  "small",
];

function setup() {
  const db = openTestDb();
  const deps: CliDeps = { db, products: PRODUCTS, timeZone: "Europe/London", now: t0 };
  const run = (...argv: string[]) => runActionsCli(argv, deps);
  const row = (id: number) => db.select().from(actions).where(eq(actions.id, id)).get();
  return { db, run, row };
}

describe("pnpm actions add", () => {
  it("creates an open hand-made action and prints it as data", () => {
    const { run, row } = setup();
    const out = run(...BASE, "--fix", "Write the titles", "--check", "Every page has a title");
    expect(out.code).toBe(0);
    expect(out.stdout.startsWith("Created action #1\n\n")).toBe(true);
    expect(out.stdout).toContain(DATA_NOTE);
    expect(out.stdout).toContain("#1  Hand the page titles to the docs owner");
    expect(out.stdout).toContain("Source: added by hand through the CLI");
    expect(out.stdout).toContain("Status: open");
    expect(row(1)).toMatchObject({
      productId: "acme-docs",
      source: "manual",
      ruleKey: null,
      sourceJobId: null,
      issuePresent: null,
      status: "open",
      snoozedUntil: null,
      prUrl: null,
      docs: [],
      fix: "Write the titles",
      check: "Every page has a title",
      evidence: { items: [], total: 0 },
    });
  });

  it("fills in a missing fix and check, and keeps evidence and docs as linked evidence", () => {
    const { run, row } = setup();
    run(...BASE, "--evidence", "Seen on /a", "--doc", "https://example.com/guide");
    expect(row(1)).toMatchObject({
      fix: NO_FIX,
      check: NO_CHECK,
      evidence: {
        items: [
          { text: "Seen on /a", url: null },
          { text: "https://example.com/guide", url: "https://example.com/guide" },
        ],
        total: 2,
      },
    });
  });

  it.each(["suggested", "open", "in_progress"] as const)("creates as %s", (status) => {
    const { run, row } = setup();
    expect(run(...BASE, "--status", status).code).toBe(0);
    expect(row(1)?.status).toBe(status);
  });

  it("records one creation event as Claude and an audit entry without the text", () => {
    const { db, run } = setup();
    run(...BASE, "--status", "in_progress");
    expect(
      actionEventsFor(db, 1).map(({ actor, from, to, note }) => ({ actor, from, to, note })),
    ).toEqual([
      { actor: "claude", from: null, to: "in_progress", note: "Added by hand through the CLI" },
    ]);
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .map((e) => [e.login, e.event, e.detail]),
    ).toEqual([
      ["claude", "action_created", { id: 1, productId: "acme-docs", status: "in_progress" }],
    ]);
    expect(run("show", "1").stdout).toContain("Claude  created as in_progress  Added by hand");
  });

  it("refuses an unknown product with the configured ones, and writes nothing", () => {
    const { db, run } = setup();
    const argv = BASE.map((a) => (a === "acme-docs" ? "nope" : a));
    const out = run(...argv);
    expect(out).toMatchObject({ code: 1, stdout: "" });
    expect(out.stderr).toBe("Unknown product: nope (configured: acme-docs, acme-blog)\n");
    expect(db.select().from(actions).all()).toEqual([]);
    expect(db.select().from(auditLog).all()).toEqual([]);
  });

  it("refuses a duplicate title of a live action of the same product, naming its id", () => {
    const { db, run } = setup();
    insertAction(
      db,
      ruleAction({ title: "Hand the PAGE titles to the docs owner!" }),
      "scan",
      null,
      t0,
    );
    for (const status of ["open", "in_progress", "snoozed", "suggested"] as const) {
      db.update(actions)
        .set({ status, snoozedUntil: status === "snoozed" ? "2026-10-09" : null })
        .where(eq(actions.id, 1))
        .run();
      const out = run(...BASE);
      expect(out.code, status).toBe(1);
      expect(out.stderr).toContain("Action #1 already has this title for acme-docs");
    }
    expect(db.select().from(actions).all()).toHaveLength(1);
    expect(db.select().from(auditLog).all()).toEqual([]);
  });

  it("allows the title again once the first is done or dismissed, or for another product", () => {
    const { db, run } = setup();
    expect(run(...BASE).code).toBe(0);
    expect(run(...BASE.map((a) => (a === "acme-docs" ? "acme-blog" : a))).code).toBe(0);
    db.update(actions).set({ status: "done" }).where(eq(actions.id, 1)).run();
    expect(run(...BASE).code).toBe(0);
    db.update(actions).set({ status: "dismissed" }).where(eq(actions.id, 3)).run();
    expect(run(...BASE).code).toBe(0);
    expect(db.select().from(actions).all()).toHaveLength(4);
  });

  it("shows up in list, list --json and show afterwards", () => {
    const { run } = setup();
    run(...BASE, "--evidence", "Seen on /a");
    expect(run("list").stdout).toContain(
      "#1  acme-docs  SEO  open  high/small  Hand the page titles to the docs owner",
    );
    const json = JSON.parse(run("list", "--json").stdout);
    expect(json.actions[0]).toMatchObject({ id: 1, source: "manual", status: "open" });
    const shown = run("show", "1").stdout;
    expect(shown).toContain("Evidence (1):\n- Seen on /a");
    expect(shown).toContain("Added by hand through the Harbour CLI — check it before acting.");
  });

  it("prints a usage error, not a stack, for bad input, and creates nothing", () => {
    const { db, run } = setup();
    const out = run(...BASE, "--doc", "http://example.com/a");
    expect(out.code).toBe(2);
    expect(out.stderr).toMatch(/^--doc must be an https:\/\/ link/);
    expect(out.stderr).toContain("Usage:");
    expect(out.stderr).not.toMatch(/\bat \S+:\d+/);
    expect(db.select().from(actions).all()).toEqual([]);
  });
});
